import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlacesForQuery } from "@/lib/places";
import { parseIsoDateTimeWithTimeZone } from "@/lib/datetime";
import { hasAnyWeekdayAvailability } from "@/lib/availability";
import {
  buildDayPriorityByWeekday,
  buildDefaultTimeCandidates,
  type AvailabilityInput,
} from "@/lib/event-time-candidates";

type PlaceCandidateInput = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  priceLevel?: number;
  score: number;
  source: "system";
};

const toPlaceCandidateInput = (place: {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  priceLevel?: number;
}): PlaceCandidateInput => ({
  placeId: place.placeId,
  name: place.name,
  address: place.address,
  lat: place.lat,
  lng: place.lng,
  priceLevel: place.priceLevel,
  score: 0,
  source: "system",
});

const buildPlaceCandidates = async (query: string): Promise<PlaceCandidateInput[]> => {
  const places = await getPlacesForQuery(query);
  const normalized = places.slice(0, 3).map(toPlaceCandidateInput);

  if (normalized.length > 0) {
    return normalized;
  }

  return Array.from({ length: 3 }).map((_: unknown, index: number) => ({
    placeId: `${query}-fallback-${index + 1}`,
    name: `${query} 候補${index + 1}`,
    address: "未設定",
    lat: 0,
    lng: 0,
    priceLevel: undefined,
    score: 0,
    source: "system" as const,
  }));
};

const buildPlaceCandidatesFromFavoriteAreas = async (
  favoriteAreas: string[],
  purpose: string
): Promise<PlaceCandidateInput[]> => {
  const uniqueByPlaceId = new Map<string, PlaceCandidateInput>();

  for (const area of favoriteAreas.slice(0, 3)) {
    const query = `${area} ${purpose}`.trim();
    const places = await getPlacesForQuery(query);

    for (const place of places) {
      if (!uniqueByPlaceId.has(place.placeId)) {
        uniqueByPlaceId.set(place.placeId, toPlaceCandidateInput(place));
      }
      if (uniqueByPlaceId.size >= 3) {
        return Array.from(uniqueByPlaceId.values()).slice(0, 3);
      }
    }
  }

  return Array.from(uniqueByPlaceId.values()).slice(0, 3);
};

const getEventStartTime = (event: {
  fixedStartTime: Date | null;
  timeCandidates: { startTime: Date }[];
}) => {
  if (event.fixedStartTime) return event.fixedStartTime;
  if (event.timeCandidates.length === 0) return null;

  const earliestTime = Math.min(
    ...event.timeCandidates.map((candidate: { startTime: Date }) => candidate.startTime.getTime())
  );
  return Number.isFinite(earliestTime) ? new Date(earliestTime) : null;
};

const calcProfileCompletion = (profile: {
  displayName: string;
  avatarIcon: string | null;
  birthDate: Date | null;
  playFrequency: string | null;
  drinkFrequency: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  ngFoods: string[];
  favoriteAreas: string[];
  favoritePlaces: string[];
  availability: unknown;
}) => {
  const checks = [
    profile.displayName.trim().length > 0,
    Boolean(profile.birthDate),
    Boolean(profile.playFrequency),
    Boolean(profile.drinkFrequency),
    profile.budgetMin != null || profile.budgetMax != null,
    profile.ngFoods.length > 0,
    profile.favoriteAreas.length > 0,
    profile.favoritePlaces.length > 0,
    hasAnyWeekdayAvailability(profile.availability),
  ];

  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
};

const FEED_CACHE_CONTROL = "no-store, max-age=0";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const viewerId = searchParams.get("viewerId");
  const includePast =
    searchParams.get("includePast") === "1" ||
    searchParams.get("includePast") === "true";
  const period = searchParams.get("period") ?? "all";

  const nowDate = new Date();
  const periodStart =
    period === "7d"
      ? new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000)
      : period === "30d"
        ? new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000)
        : period === "90d"
          ? new Date(nowDate.getTime() - 90 * 24 * 60 * 60 * 1000)
          : null;

  const feedCacheControl = FEED_CACHE_CONTROL;

  const events = await prisma.event.findMany({
    include: {
      owner: true,
      participants: true,
      invites: true,
      timeCandidates: true,
      placeCandidates: true,
    },
    orderBy: { createdAt: "desc" },
  });

  let favoriteOwnerIds = new Set<string>();
  if (viewerId) {
    const favorites = await prisma.favoriteFriend.findMany({
      where: { userId: viewerId },
      select: { favoriteUserId: true },
    });
    favoriteOwnerIds = new Set(favorites.map((favorite: any) => favorite.favoriteUserId));
  }

  const formatted = events
    .filter((event: any) => {
      if (!viewerId) {
        return event.visibility === "public";
      }

      const isOwner = event.ownerId === viewerId;
      const isParticipant = event.participants.some((participant: any) => participant.userId === viewerId);
      const isInvited = event.invites.some((invite: any) => invite.inviteeId === viewerId);
      return event.visibility === "public" || isOwner || isParticipant || isInvited;
    })
    .map((event: any) => {
      const eventArea = (event as { area?: string | null }).area ?? null;
      const approvedCount = event.participants.filter(
        (participant: any) => participant.status === "approved"
      ).length;
      const isOwner = viewerId ? event.ownerId === viewerId : false;
      const isJoinedParticipant = viewerId
        ? event.participants.some(
            (participant: any) =>
              participant.userId === viewerId &&
              participant.status !== "declined" &&
              participant.status !== "cancelled"
          )
        : false;
      const pendingInvite = viewerId
        ? event.invites.find(
            (invite: any) =>
              invite.inviteeId === viewerId &&
              (invite.status === "pending" || invite.status === "accepted")
          )
        : undefined;
      const timeCandidates = [...event.timeCandidates]
        .sort((a: any, b: any) => {
          const ta = new Date(a.startTime).getTime();
          const tb = new Date(b.startTime).getTime();
          return ta - tb;
        })
        .slice(0, 3)
        .map((candidate: any) => ({
          id: candidate.id,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
          score: candidate.score,
        }));
      const placeCandidates = [...event.placeCandidates]
        .slice(0, 3)
        .map((candidate: any) => ({
          id: candidate.id,
          name: candidate.name,
          address: candidate.address,
          score: candidate.score,
        }));
      const startTime = getEventStartTime(event);

      return {
        id: event.id,
        purpose: event.purpose,
        area: eventArea,
        visibility: event.visibility,
        capacity: event.capacity,
        status: event.status,
        scheduleMode: event.scheduleMode,
        startTime,
        fixedStartTime: event.fixedStartTime,
        fixedEndTime: event.fixedEndTime,
        fixedPlaceId: event.fixedPlaceId,
        fixedPlaceName: event.fixedPlaceName,
        fixedPlaceAddress: event.fixedPlaceAddress,
        owner: {
          userId: event.owner.userId,
          displayName: event.owner.displayName,
          avatarIcon: event.owner.avatarIcon,
        },
        approvedCount,
        participantUserIds: event.participants
          .filter((participant: any) => participant.status === "approved")
          .map((participant: any) => participant.userId),
        timeCandidates,
        placeCandidates,
        isFavoriteOwner: viewerId ? favoriteOwnerIds.has(event.ownerId) : false,
        viewerRelation: isOwner || isJoinedParticipant
          ? "participating"
          : pendingInvite
            ? "invited"
            : "public",
        createdAt: event.createdAt,
      };
    })
    .sort((a: any, b: any) => {
      if (a.isFavoriteOwner && !b.isFavoriteOwner) return -1;
      if (!a.isFavoriteOwner && b.isFavoriteOwner) return 1;
      return 0;
    });

  const now = Date.now();

  if (includePast) {
    const history = formatted
      .filter(
        (event: any) =>
          event.viewerRelation === "participating" &&
          event.status !== "cancelled" &&
          event.startTime != null &&
          new Date(event.startTime).getTime() <= now &&
          (!periodStart || new Date(event.startTime).getTime() >= periodStart.getTime())
      )
      .sort(
        (a: any, b: any) =>
          new Date(b.startTime as Date).getTime() -
          new Date(a.startTime as Date).getTime()
      );

    return NextResponse.json(
      {
        history,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }

  const upcoming = formatted.filter(
    (event: any) =>
      event.startTime == null || new Date(event.startTime).getTime() > now
  );

  const participating = upcoming.filter((event: any) => event.viewerRelation === "participating");
  const invited = upcoming.filter((event: any) => event.viewerRelation === "invited");
  const publicEvents = upcoming.filter((event: any) => event.viewerRelation === "public");

  return NextResponse.json(
    {
      participating,
      invited,
      public: publicEvents,
    },
    {
      headers: {
        "Cache-Control": feedCacheControl,
      },
    }
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    ownerId?: string;
    purpose?: string;
    comment?: string;
    eventArea?: string;
    visibility?: "public" | "limited" | "private";
    capacity?: number;
    scheduleMode?: "fixed" | "candidate";
    timeSetting?: "auto" | "manual";
    placeSetting?: "auto" | "manual";
    fixedStartTime?: string;
    fixedPlace?: {
      placeId: string;
      name: string;
      address: string;
    };
    placeQuery?: string;
    candidatePlaces?: {
      placeId: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      priceLevel?: number;
    }[];
    inviteeIds?: string[];
  };

  if (!body.ownerId || !body.purpose || body.capacity == null) {
    return NextResponse.json(
      { message: "ownerId, purpose, capacity are required" },
      { status: 400 }
    );
  }

  const legacyFixed = body.scheduleMode === "fixed";
  const isTimeManual = body.timeSetting
    ? body.timeSetting === "manual"
    : legacyFixed;
  const isPlaceManual = body.placeSetting
    ? body.placeSetting === "manual"
    : legacyFixed;
  const resolvedScheduleMode =
    isTimeManual && isPlaceManual ? "fixed" : "candidate";

  if (isTimeManual && !body.fixedStartTime) {
    return NextResponse.json(
      { message: "fixedStartTime is required when timeSetting is manual" },
      { status: 400 }
    );
  }

  if (isPlaceManual && !body.fixedPlace) {
    return NextResponse.json(
      { message: "fixedPlace is required when placeSetting is manual" },
      { status: 400 }
    );
  }

  const inviteeIds = Array.from(
    new Set(
      (body.inviteeIds ?? []).filter(
        (inviteeId) =>
          typeof inviteeId === "string" &&
          inviteeId.trim().length > 0 &&
          inviteeId !== body.ownerId
      )
    )
  );

  let ownerProfile = await prisma.profile.findUnique({
    where: { userId: body.ownerId },
  });

  if (!ownerProfile) {
    ownerProfile = await prisma.profile.create({
      data: {
        userId: body.ownerId,
        displayName: `ユーザー${body.ownerId.slice(0, 4)}`,
        gender: "unspecified",
        favoriteAreas: body.eventArea?.trim() ? [body.eventArea.trim()] : [],
      },
    });
  }

  const completionRate = calcProfileCompletion(ownerProfile);
  if (completionRate < 100) {
    return NextResponse.json(
      {
        message:
          "プロフィール設定が100%未満のため、イベントを作成できません。プロフィールを更新してください。",
        completionRate,
      },
      { status: 403 }
    );
  }

  const normalizedEventArea = body.eventArea?.trim();
  const resolvedEventArea =
    normalizedEventArea || ownerProfile?.favoriteAreas?.[0] || null;

  const fixedStartDate =
    isTimeManual && body.fixedStartTime
      ? (parseIsoDateTimeWithTimeZone(body.fixedStartTime) ?? undefined)
      : undefined;
  if (isTimeManual && !fixedStartDate) {
    return NextResponse.json(
      {
        message:
          "fixedStartTime must include timezone offset or Z (ISO 8601), e.g. 2026-04-10T10:00:00.000Z",
      },
      { status: 400 }
    );
  }
  const fixedEndDate = fixedStartDate
    ? new Date(fixedStartDate.getTime() + 2 * 60 * 60 * 1000)
    : undefined;

  const eventCreateData: {
    ownerId: string;
    purpose: string;
    comment?: string | null;
    area?: string | null;
    visibility: "public" | "limited" | "private";
    capacity: number;
    scheduleMode: "fixed" | "candidate";
    fixedStartTime?: Date;
    fixedEndTime?: Date;
    fixedPlaceId?: string;
    fixedPlaceName?: string;
    fixedPlaceAddress?: string;
  } = {
    ownerId: body.ownerId,
    purpose: body.purpose,
    comment: body.comment?.trim() ? body.comment.trim() : null,
    visibility: body.visibility ?? "public",
    capacity: body.capacity,
    scheduleMode: resolvedScheduleMode,
    fixedStartTime: fixedStartDate,
    fixedEndTime: fixedEndDate,
    fixedPlaceId: body.fixedPlace?.placeId,
    fixedPlaceName: body.fixedPlace?.name,
    fixedPlaceAddress: body.fixedPlace?.address,
  };

  if (resolvedEventArea) {
    eventCreateData.area = resolvedEventArea;
  }

  let event;
  try {
    event = await prisma.event.create({
      data: eventCreateData as never,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unknown argument `area`")) {
      const fallbackData = { ...eventCreateData };
      delete fallbackData.area;
      event = await prisma.event.create({
        data: fallbackData,
      });
    } else {
      throw error;
    }
  }

  await prisma.eventParticipant.create({
    data: {
      eventId: event.id,
      userId: body.ownerId,
      status: "approved",
      role: "owner",
    },
  });

  if (
    resolvedEventArea &&
    ownerProfile &&
    (ownerProfile.favoriteAreas?.length ?? 0) === 0
  ) {
    await prisma.profile.update({
      where: { userId: body.ownerId },
      data: {
        favoriteAreas: [resolvedEventArea],
      },
    });
  }

  if (resolvedScheduleMode === "candidate") {
    if (!isTimeManual) {
      let inviteeAvailabilities: unknown[] = [];
      if (inviteeIds.length > 0) {
        const inviteeProfiles = await prisma.profile.findMany({
          where: {
            userId: {
              in: inviteeIds,
            },
          },
          select: {
            availability: true,
          },
        });
        inviteeAvailabilities = inviteeProfiles.map((profile) => profile.availability);
      }

      const dayPriorityByWeekday = buildDayPriorityByWeekday([
        ownerProfile?.availability,
        ...inviteeAvailabilities,
      ]);

      const timeCandidates = buildDefaultTimeCandidates(
        ownerProfile?.availability as AvailabilityInput | undefined,
        dayPriorityByWeekday
      );
      await prisma.eventTimeCandidate.createMany({
        data: timeCandidates.map((candidate: any) => ({
          eventId: event.id,
          ...candidate,
        })),
      });
    }

    if (!isPlaceManual) {
      if (body.candidatePlaces && body.candidatePlaces.length > 0) {
        await prisma.eventPlaceCandidate.createMany({
          data: body.candidatePlaces.slice(0, 5).map((candidate: any) => ({
            eventId: event.id,
            placeId: candidate.placeId,
            name: candidate.name,
            address: candidate.address,
            lat: candidate.lat,
            lng: candidate.lng,
            priceLevel: candidate.priceLevel,
            score: 0,
            source: "system",
          })),
        });
      } else {
        const preferredAreas = resolvedEventArea
          ? [
              resolvedEventArea,
              ...(ownerProfile?.favoriteAreas ?? []).filter(
                (area: string) => area !== resolvedEventArea
              ),
            ]
          : ownerProfile?.favoriteAreas ?? [];
        const favoriteAreaCandidates = await buildPlaceCandidatesFromFavoriteAreas(
          preferredAreas,
          body.purpose
        );

        const fallbackQuery = resolvedEventArea
          ? `${resolvedEventArea} ${body.purpose}`
          : ownerProfile?.favoriteAreas?.[0]
            ? `${ownerProfile.favoriteAreas[0]} ${body.purpose}`
            : body.purpose;
        const query = body.placeQuery ?? fallbackQuery;
        const fallbackCandidates = query ? await buildPlaceCandidates(query) : [];

        const mergedByPlaceId = new Map<string, PlaceCandidateInput>();
        for (const candidate of [...favoriteAreaCandidates, ...fallbackCandidates]) {
          if (!mergedByPlaceId.has(candidate.placeId)) {
            mergedByPlaceId.set(candidate.placeId, candidate);
          }
          if (mergedByPlaceId.size >= 3) break;
        }

        const placeCandidates = Array.from(mergedByPlaceId.values()).slice(0, 3);

        if (placeCandidates.length > 0) {
          await prisma.eventPlaceCandidate.createMany({
            data: placeCandidates.map((candidate: any) => ({
              eventId: event.id,
              ...candidate,
            })),
          });
        }
      }
    }
  }

  if (inviteeIds.length > 0) {
    await prisma.eventInvite.createMany({
      data: inviteeIds.map((inviteeId: string) => ({
        eventId: event.id,
        inviterId: body.ownerId as string,
        inviteeId,
        token: crypto.randomUUID(),
        status: "pending" as const,
      })),
    });
  }

  return NextResponse.json({ id: event.id });
}
