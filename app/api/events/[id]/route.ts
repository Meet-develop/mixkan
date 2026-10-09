import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TimeAvailability } from "@prisma/client";
import { getPlacePhotoUrlByPlaceId, getPlacesForQuery } from "@/lib/places";
import { createAppNotifications } from "@/lib/notification-delivery";
import { parseIsoDateTimeWithTimeZone } from "@/lib/datetime";
import {
  buildDayPriorityByWeekday,
  buildDefaultTimeCandidates,
  type AvailabilityInput,
} from "@/lib/event-time-candidates";

const EVENT_DETAIL_CACHE_CONTROL = "no-store, max-age=0";
const REGENERATED_PLACE_CANDIDATE_LIMIT = 3;

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

const buildPlaceCandidatesFromFavoriteAreas = async (
  favoriteAreas: string[],
  purpose: string,
  limit = REGENERATED_PLACE_CANDIDATE_LIMIT
): Promise<PlaceCandidateInput[]> => {
  const uniqueByPlaceId = new Map<string, PlaceCandidateInput>();

  for (const area of favoriteAreas.slice(0, 3)) {
    const query = `${area} ${purpose}`.trim();
    const places = await getPlacesForQuery(query);

    for (const place of places) {
      if (!uniqueByPlaceId.has(place.placeId)) {
        uniqueByPlaceId.set(place.placeId, toPlaceCandidateInput(place));
      }
      if (uniqueByPlaceId.size >= limit) {
        return Array.from(uniqueByPlaceId.values()).slice(0, limit);
      }
    }
  }

  return Array.from(uniqueByPlaceId.values()).slice(0, limit);
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url);
  const viewerId = searchParams.get("viewerId");
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      owner: true,
      participants: { include: { user: true } },
      inviteRequests: {
        where: { status: "pending" },
        include: { requester: true, invitee: true },
        orderBy: { createdAt: "desc" },
      },
      invites: {
        include: { inviter: true, invitee: true },
        orderBy: { createdAt: "desc" },
      },
      timeCandidates: { include: { votes: true } },
      placeCandidates: { include: { votes: true } },
    },
  });

  if (!event) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const inviterByInviteeId = new Map<
    string,
    { userId: string; displayName: string; avatarIcon?: string | null }
  >();

  for (const invite of event.invites) {
    if (!invite.inviteeId) continue;
    if (invite.status === "declined") continue;
    if (inviterByInviteeId.has(invite.inviteeId)) continue;

    inviterByInviteeId.set(invite.inviteeId, {
      userId: invite.inviter.userId,
      displayName: invite.inviter.displayName,
      avatarIcon: invite.inviter.avatarIcon,
    });
  }

  const participants = event.participants.map((participant: any) => ({
    userId: participant.userId,
    displayName: participant.user.displayName,
    avatarIcon: participant.user.avatarIcon,
    status: participant.status,
    role: participant.role,
    invitedBy: inviterByInviteeId.get(participant.userId) ?? null,
  }));

  const participantUserIds = new Set(participants.map((participant: any) => participant.userId));

  const pendingInviteeIds = new Set<string>();
  const invitedUsers = event.invites
    .filter((invite: any) => {
      if (invite.status !== "pending") return false;
      if (!invite.inviteeId) return false;
      if (participantUserIds.has(invite.inviteeId)) return false;
      if (pendingInviteeIds.has(invite.inviteeId)) return false;
      pendingInviteeIds.add(invite.inviteeId);
      return true;
    })
    .map((invite: any) => ({
      userId: invite.inviteeId as string,
      displayName: invite.invitee?.displayName ?? "招待中ユーザー",
      avatarIcon: invite.invitee?.avatarIcon ?? null,
      status: "requested" as const,
      role: "guest" as const,
      invitedBy: {
        userId: invite.inviter.userId,
        displayName: invite.inviter.displayName,
        avatarIcon: invite.inviter.avatarIcon,
      },
    }));

  const availabilityWeight: Record<TimeAvailability, number> = {
    [TimeAvailability.available]: 2,
    [TimeAvailability.maybe]: 1,
    [TimeAvailability.unavailable]: 0,
  };

  const timeCandidates = event.timeCandidates
    .map((candidate: any) => {
      const weightedScore = candidate.votes.reduce(
        (acc: number, vote: any) => acc + (availabilityWeight[vote.availability as TimeAvailability] ?? 0),
        0
      );
      const availableVotes = candidate.votes.filter(
        (vote: any) => vote.availability === "available"
      ).length;
      const myVote = viewerId
        ? candidate.votes.find((vote: any) => vote.userId === viewerId)
        : undefined;
      return {
        id: candidate.id,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        score: candidate.score + weightedScore,
        source: candidate.source,
        proposedBy: candidate.proposedBy,
        availableVotes,
        myAvailability: myVote?.availability ?? null,
      };
    })
    .sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 5);

  const placeCandidates = (
    await Promise.all(
      event.placeCandidates.map(async (candidate: any) => {
        const totalScore = candidate.votes.reduce((acc: number, vote: any) => acc + vote.score, 0);
        const myVote = viewerId
          ? candidate.votes.find((vote: any) => vote.userId === viewerId)
          : undefined;
        const photoUrl = await getPlacePhotoUrlByPlaceId(candidate.placeId);
        return {
          id: candidate.id,
          placeId: candidate.placeId,
          name: candidate.name,
          address: candidate.address,
          lat: candidate.lat,
          lng: candidate.lng,
          photoUrl,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            `${candidate.lat},${candidate.lng}`
          )}&query_place_id=${encodeURIComponent(candidate.placeId)}`,
          priceLevel: candidate.priceLevel,
          score: candidate.score + totalScore,
          source: candidate.source,
          proposedBy: candidate.proposedBy,
          myScore: myVote?.score ?? null,
        };
      })
    )
  )
    .slice(0, 5);

  const eventArea = (event as { area?: string | null }).area ?? null;
  const eventComment = (event as { comment?: string | null }).comment ?? null;

  const inviteRequests = ((event as { inviteRequests?: Array<{
    id: string;
    requester: { userId: string; displayName: string; avatarIcon?: string | null };
    invitee: { userId: string; displayName: string; avatarIcon?: string | null };
    createdAt: Date;
  }> }).inviteRequests ?? []).map((request: any) => ({
    id: request.id,
    requester: {
      userId: request.requester.userId,
      displayName: request.requester.displayName,
      avatarIcon: request.requester.avatarIcon,
    },
    invitee: {
      userId: request.invitee.userId,
      displayName: request.invitee.displayName,
      avatarIcon: request.invitee.avatarIcon,
    },
    createdAt: request.createdAt,
  }));

  return NextResponse.json(
    {
      id: event.id,
      updatedAt: event.updatedAt,
      purpose: event.purpose,
      comment: eventComment,
      area: eventArea,
      visibility: event.visibility,
      capacity: event.capacity,
      status: event.status,
      scheduleMode: event.scheduleMode,
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
      participants,
      invitedUsers,
      inviteRequests,
      timeCandidates,
      placeCandidates,
    },
    {
      headers: {
        "Cache-Control": EVENT_DETAIL_CACHE_CONTROL,
      },
    }
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as {
    ownerId?: string;
    purpose?: string;
    comment?: string;
    eventArea?: string;
    visibility?: "public" | "limited" | "private";
    capacity?: number;
    timeSetting?: "auto" | "candidates" | "manual";
    placeSetting?: "auto" | "manual";
    fixedStartTime?: string;
    fixedPlace?: {
      placeId?: string;
      name?: string;
      address?: string;
    } | null;
    placeQuery?: string;
    userTimeCandidates?: {
      startTime: string;
      endTime: string;
    }[];
    candidatePlaces?: {
      placeId: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
      priceLevel?: number;
    }[];
  };

  if (!body.ownerId) {
    return NextResponse.json({ message: "Missing ownerId" }, { status: 400 });
  }

  if (
    body.timeSetting === "candidates" &&
    (!body.userTimeCandidates || body.userTimeCandidates.length === 0)
  ) {
    return NextResponse.json(
      { message: "userTimeCandidates must not be empty when timeSetting is candidates" },
      { status: 400 }
    );
  }

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      participants: true,
      timeCandidates: true,
      placeCandidates: true,
    },
  });

  if (!event) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  if (event.ownerId !== body.ownerId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const updateData: {
    purpose?: string;
    comment?: string | null;
    area?: string | null;
    visibility?: "public" | "limited" | "private";
    capacity?: number;
    scheduleMode?: "fixed" | "candidate";
    fixedStartTime?: Date | null;
    fixedEndTime?: Date | null;
    fixedPlaceId?: string | null;
    fixedPlaceName?: string | null;
    fixedPlaceAddress?: string | null;
  } = {};

  const hasTimeSetting =
    body.timeSetting === "auto" ||
    body.timeSetting === "candidates" ||
    body.timeSetting === "manual";
  const hasPlaceSetting =
    body.placeSetting === "auto" || body.placeSetting === "manual";
  const hasFixedPlacePayload = body.fixedPlace !== undefined;

  const currentTimeSetting: "auto" | "manual" = event.fixedStartTime
    ? "manual"
    : "auto";
  const hasCurrentFixedPlace = Boolean(
    event.fixedPlaceId && event.fixedPlaceName && event.fixedPlaceAddress
  );
  const currentPlaceSetting: "auto" | "manual" = hasCurrentFixedPlace
    ? "manual"
    : "auto";

  const nextTimeSetting = hasTimeSetting ? body.timeSetting : currentTimeSetting;
  const nextPlaceSetting = hasPlaceSetting ? body.placeSetting : currentPlaceSetting;
  const derivedScheduleMode: "fixed" | "candidate" =
    nextTimeSetting === "manual" && nextPlaceSetting === "manual"
      ? "fixed"
      : "candidate";

  if (typeof body.purpose === "string" && body.purpose.trim().length > 0) {
    updateData.purpose = body.purpose.trim();
  }

  if (typeof body.comment === "string") {
    const normalizedComment = body.comment.trim();
    updateData.comment = normalizedComment.length > 0 ? normalizedComment : null;
  }

  if (typeof body.eventArea === "string") {
    const normalizedArea = body.eventArea.trim();
    updateData.area = normalizedArea.length > 0 ? normalizedArea : null;
  }

  if (
    body.visibility === "public" ||
    body.visibility === "limited" ||
    body.visibility === "private"
  ) {
    updateData.visibility = body.visibility;
  }

  if (typeof body.capacity === "number" && Number.isFinite(body.capacity)) {
    updateData.capacity = Math.max(2, Math.floor(body.capacity));
  }

  if (hasTimeSetting && body.timeSetting === "manual") {
    const sourceFixedStartTime =
      body.fixedStartTime ?? event.fixedStartTime?.toISOString();
    if (!sourceFixedStartTime) {
      return NextResponse.json(
        { message: "fixedStartTime is required when timeSetting is manual" },
        { status: 400 }
      );
    }

    const fixedStartTime = parseIsoDateTimeWithTimeZone(sourceFixedStartTime);
    if (!fixedStartTime) {
      return NextResponse.json(
        {
          message:
            "fixedStartTime must include timezone offset or Z (ISO 8601), e.g. 2026-04-10T10:00:00.000Z",
        },
        { status: 400 }
      );
    }

    updateData.fixedStartTime = fixedStartTime;
    updateData.fixedEndTime = new Date(
      fixedStartTime.getTime() + 2 * 60 * 60 * 1000
    );
  } else if (hasTimeSetting && (body.timeSetting === "auto" || body.timeSetting === "candidates")) {
    updateData.fixedStartTime = null;
    updateData.fixedEndTime = null;
  }

  if (hasTimeSetting || hasPlaceSetting) {
    updateData.scheduleMode = derivedScheduleMode;
  }

  const isTimeCandidatesMode = body.timeSetting === "candidates";
  const shouldRegenerateTimeCandidates =
    nextTimeSetting === "auto" &&
    (currentTimeSetting === "manual" || event.timeCandidates.length === 0);
  const shouldReplaceWithUserCandidates =
    isTimeCandidatesMode &&
    body.userTimeCandidates != null &&
    body.userTimeCandidates.length > 0;
  const shouldDeleteTimeCandidates =
    (hasTimeSetting && body.timeSetting === "manual") ||
    shouldRegenerateTimeCandidates ||
    shouldReplaceWithUserCandidates;

  const shouldRegeneratePlaceCandidates =
    nextPlaceSetting === "auto" &&
    (currentPlaceSetting === "manual" || event.placeCandidates.length === 0);

  let shouldDeletePlaceCandidates = shouldRegeneratePlaceCandidates;

  if (hasPlaceSetting && body.placeSetting === "manual") {
    const sourceFixedPlace =
      body.fixedPlace ??
      (event.fixedPlaceId && event.fixedPlaceName && event.fixedPlaceAddress
        ? {
            placeId: event.fixedPlaceId,
            name: event.fixedPlaceName,
            address: event.fixedPlaceAddress,
          }
        : null);

    const placeId = sourceFixedPlace?.placeId?.trim();
    const placeName = sourceFixedPlace?.name?.trim();
    const placeAddress = sourceFixedPlace?.address?.trim();

    if (!placeId || !placeName || !placeAddress) {
      return NextResponse.json(
        { message: "fixedPlace is required when placeSetting is manual" },
        { status: 400 }
      );
    }

    const fixedPlaceChanged =
      event.fixedPlaceId !== placeId ||
      event.fixedPlaceName !== placeName ||
      event.fixedPlaceAddress !== placeAddress;

    if (fixedPlaceChanged) {
      updateData.fixedPlaceId = placeId;
      updateData.fixedPlaceName = placeName;
      updateData.fixedPlaceAddress = placeAddress;
    }

    if (currentPlaceSetting !== "manual" || fixedPlaceChanged) {
      shouldDeletePlaceCandidates = true;
    }
  } else if (hasPlaceSetting && body.placeSetting === "auto") {
    if (currentPlaceSetting === "manual") {
      updateData.fixedPlaceId = null;
      updateData.fixedPlaceName = null;
      updateData.fixedPlaceAddress = null;
    }
  } else if (hasFixedPlacePayload && nextPlaceSetting === "manual") {
    const placeId = body.fixedPlace?.placeId?.trim();
    const placeName = body.fixedPlace?.name?.trim();
    const placeAddress = body.fixedPlace?.address?.trim();

    if (!placeId || !placeName || !placeAddress) {
      return NextResponse.json(
        { message: "fixedPlace is required when placeSetting is manual" },
        { status: 400 }
      );
    }

    const fixedPlaceChanged =
      event.fixedPlaceId !== placeId ||
      event.fixedPlaceName !== placeName ||
      event.fixedPlaceAddress !== placeAddress;

    if (fixedPlaceChanged) {
      updateData.fixedPlaceId = placeId;
      updateData.fixedPlaceName = placeName;
      updateData.fixedPlaceAddress = placeAddress;
      shouldDeletePlaceCandidates = true;
    }
  }

  let updated;
  try {
    updated = await prisma.event.update({
      where: { id },
      data: updateData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unknown argument `area`")) {
      const fallbackData = { ...updateData };
      delete fallbackData.area;
      updated = await prisma.event.update({
        where: { id },
        data: fallbackData,
      });
    } else {
      throw error;
    }
  }

  if (shouldDeletePlaceCandidates) {
    await prisma.eventPlaceCandidate.deleteMany({
      where: { eventId: id },
    });
  }

  if (shouldDeleteTimeCandidates && shouldReplaceWithUserCandidates && body.userTimeCandidates) {
    const parsedCandidates = body.userTimeCandidates.slice(0, 10).map((c) => {
      const start = new Date(c.startTime);
      const end = new Date(c.endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error(`Invalid date in userTimeCandidates: ${JSON.stringify(c)}`);
      }
      return { eventId: id, startTime: start, endTime: end, score: 0, source: "system" as const };
    });
    await prisma.$transaction([
      prisma.eventTimeCandidate.deleteMany({ where: { eventId: id } }),
      prisma.eventTimeCandidate.createMany({ data: parsedCandidates }),
    ]);
  } else if (shouldDeleteTimeCandidates) {
    await prisma.eventTimeCandidate.deleteMany({ where: { eventId: id } });
  }

  if (shouldRegenerateTimeCandidates) {
    type ParticipantAvailabilitySource = { userId: string; status: string };
    type ProfileAvailabilitySource = { availability: unknown };

    const approvedParticipantIds = event.participants
      .filter(
        (participant: ParticipantAvailabilitySource) =>
          participant.userId !== event.ownerId && participant.status === "approved"
      )
      .map((participant: ParticipantAvailabilitySource) => participant.userId);

    const [ownerProfile, participantProfiles] = await Promise.all([
      prisma.profile.findUnique({
        where: { userId: event.ownerId },
        select: { availability: true },
      }),
      approvedParticipantIds.length > 0
        ? prisma.profile.findMany({
            where: {
              userId: {
                in: approvedParticipantIds,
              },
            },
            select: { availability: true },
          })
        : Promise.resolve([]),
    ]);

    const dayPriorityByWeekday = buildDayPriorityByWeekday([
      ownerProfile?.availability,
      ...participantProfiles.map(
        (profile: ProfileAvailabilitySource) => profile.availability
      ),
    ]);

    const regeneratedTimeCandidates = buildDefaultTimeCandidates(
      ownerProfile?.availability as AvailabilityInput | undefined,
      dayPriorityByWeekday
    );

    if (regeneratedTimeCandidates.length > 0) {
      await prisma.eventTimeCandidate.createMany({
        data: regeneratedTimeCandidates.map((candidate) => ({
          eventId: id,
          ...candidate,
        })),
      });
    }
  }

  if (shouldRegeneratePlaceCandidates) {
    const manualCandidatePlaces = (body.candidatePlaces ?? [])
      .filter(
        (candidate) =>
          typeof candidate.placeId === "string" &&
          candidate.placeId.trim().length > 0 &&
          typeof candidate.name === "string" &&
          candidate.name.trim().length > 0
      )
      .slice(0, REGENERATED_PLACE_CANDIDATE_LIMIT)
      .map((candidate) => toPlaceCandidateInput(candidate));

    let nextPlaceCandidates = manualCandidatePlaces;

    if (nextPlaceCandidates.length === 0) {
      const ownerProfile = await prisma.profile.findUnique({
        where: { userId: event.ownerId },
        select: { favoriteAreas: true },
      });

      const resolvedPurpose = updateData.purpose ?? event.purpose;
      const resolvedArea =
        updateData.area === undefined
          ? event.area
          : updateData.area;

      const preferredAreas = resolvedArea
        ? [
            resolvedArea,
            ...(ownerProfile?.favoriteAreas ?? []).filter(
              (area: string) => area !== resolvedArea
            ),
          ]
        : ownerProfile?.favoriteAreas ?? [];

      const favoriteAreaCandidates = await buildPlaceCandidatesFromFavoriteAreas(
        preferredAreas,
        resolvedPurpose,
        REGENERATED_PLACE_CANDIDATE_LIMIT
      );

      const fallbackQuery =
        body.placeQuery?.trim() ||
        (resolvedArea ? `${resolvedArea} ${resolvedPurpose}` : "").trim() ||
        ((ownerProfile?.favoriteAreas?.[0]
          ? `${ownerProfile.favoriteAreas[0]} ${resolvedPurpose}`
          : resolvedPurpose) as string);

      const fallbackCandidates = fallbackQuery
        ? (await getPlacesForQuery(fallbackQuery)).map(toPlaceCandidateInput)
        : [];

      const mergedByPlaceId = new Map<string, PlaceCandidateInput>();
      for (const candidate of [...favoriteAreaCandidates, ...fallbackCandidates]) {
        if (!mergedByPlaceId.has(candidate.placeId)) {
          mergedByPlaceId.set(candidate.placeId, candidate);
        }
        if (mergedByPlaceId.size >= REGENERATED_PLACE_CANDIDATE_LIMIT) {
          break;
        }
      }

      nextPlaceCandidates = Array.from(mergedByPlaceId.values()).slice(
        0,
        REGENERATED_PLACE_CANDIDATE_LIMIT
      );
    }

    if (nextPlaceCandidates.length > 0) {
      await prisma.eventPlaceCandidate.createMany({
        data: nextPlaceCandidates.map((candidate) => ({
          eventId: id,
          ...candidate,
        })),
      });
    }
  }

  const notifyUserIds = event.participants
    .filter(
      (participant: any) =>
        participant.userId !== event.ownerId && participant.status === "approved"
    )
    .map((participant: any) => participant.userId);

  if (notifyUserIds.length > 0) {
    await createAppNotifications(
      notifyUserIds.map((userId: string) => ({
        userId,
        type: "event_confirmed",
        title: "イベント情報が更新されました",
        body: `「${updated.purpose}」の内容が更新されました。`,
        message: `「${updated.purpose}」の内容が更新されました。`,
        eventId: updated.id,
      }))
    );
  }

  return NextResponse.json({ success: true, eventId: updated.id });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as { ownerId?: string };

  if (!body.ownerId) {
    return NextResponse.json({ message: "Missing ownerId" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      participants: true,
    },
  });

  if (!event) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  if (event.ownerId !== body.ownerId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const notifyUserIds = event.participants
    .filter(
      (participant: any) =>
        participant.userId !== event.ownerId &&
        participant.status !== "declined" &&
        participant.status !== "cancelled"
    )
    .map((participant: any) => participant.userId);

  if (notifyUserIds.length > 0) {
    await createAppNotifications(
      notifyUserIds.map((userId: string) => ({
        userId,
        type: "invite_received",
        title: "イベントが削除されました",
        body: `「${event.purpose}」は主催者により削除されました。`,
        message: `「${event.purpose}」は主催者により削除されました。`,
      }))
    );
  }

  await prisma.event.delete({ where: { id: event.id } });

  return NextResponse.json({ deleted: true });
}
