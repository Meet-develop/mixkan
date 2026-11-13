import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SHARED_EVENTS_CACHE_CONTROL = "no-store, max-age=0";

const getEventStartTime = (event: {
  fixedStartTime: Date | null;
  timeCandidates: { startTime: Date }[];
}) => {
  if (event.fixedStartTime) {
    return event.fixedStartTime;
  }
  if (event.timeCandidates.length === 0) {
    return null;
  }

  const earliest = Math.min(
    ...event.timeCandidates.map((candidate: { startTime: Date }) => candidate.startTime.getTime())
  );
  return Number.isFinite(earliest) ? new Date(earliest) : null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const viewerId = searchParams.get("viewerId");

  if (!viewerId) {
    return NextResponse.json({ message: "viewerId is required" }, { status: 400 });
  }

  if (viewerId !== id) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: viewerId, friendId: id, status: "accepted" },
          { userId: id, friendId: viewerId, status: "accepted" },
        ],
      },
      select: { userId: true },
    });

    if (!friendship) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
  }

  const events = await prisma.event.findMany({
    where: {
      participants: {
        some: {
          userId: viewerId,
          status: "approved",
        },
      },
      AND: [
        {
          participants: {
            some: {
              userId: id,
              status: "approved",
            },
          },
        },
      ],
      status: {
        not: "cancelled",
      },
    },
    include: {
      owner: {
        select: {
          userId: true,
          displayName: true,
          avatarIcon: true,
        },
      },
      timeCandidates: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          score: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();

  const sharedEvents = events
    .map((event) => {
      const startTime = getEventStartTime(event);
      return {
        id: event.id,
        purpose: event.purpose,
        fixedStartTime: event.fixedStartTime,
        startTime,
        timeCandidates: event.timeCandidates,
        owner: event.owner,
        createdAt: event.createdAt,
      };
    })
    .filter(
      (event) =>
        event.startTime != null && new Date(event.startTime).getTime() <= now
    )
    .sort(
      (a, b) =>
        new Date(b.startTime ?? b.createdAt).getTime() -
        new Date(a.startTime ?? a.createdAt).getTime()
    )
    .slice(0, 20);

  return NextResponse.json(
    { sharedEvents },
    {
      headers: {
        "Cache-Control": SHARED_EVENTS_CACHE_CONTROL,
      },
    }
  );
}
