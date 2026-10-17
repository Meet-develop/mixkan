import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAppNotification, createAppNotifications } from "@/lib/notification-delivery";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as {
    actorId?: string;
    friendIds?: string[];
    mode?: "invite" | "request" | "link";
  };

  if (!body.actorId) {
    return NextResponse.json(
      { message: "actorId is required" },
      { status: 400 }
    );
  }

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      participants: true,
      invites: true,
      owner: true,
    },
  });

  if (!event) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const actor = await prisma.profile.findUnique({ where: { userId: body.actorId } });
  if (!actor) {
    return NextResponse.json({ message: "Actor not found" }, { status: 404 });
  }

  const actorCanInvite =
    body.actorId === event.ownerId ||
    event.participants.some(
      (participant: { userId: string; status: string }) =>
        participant.userId === body.actorId && participant.status === "approved"
    );
  if (!actorCanInvite) {
    return NextResponse.json(
      { message: "Only participants can create invites" },
      { status: 403 }
    );
  }
  // If creating a shareable invite link, create a token record and return it.
  if (body.mode === "link") {
    const created = await prisma.eventInvite.create({
      data: {
        eventId: event.id,
        inviterId: body.actorId as string,
        inviteeId: null,
        token: crypto.randomUUID(),
        status: "pending",
      },
    });

    return NextResponse.json({ token: created.token });
  }

  if (!body.friendIds || body.friendIds.length === 0) {
    return NextResponse.json(
      { message: "friendIds are required" },
      { status: 400 }
    );
  }

  const friendIds = Array.from(new Set(body.friendIds)).filter(
    (friendId) => friendId !== event.ownerId
  );

  const existingParticipantIds = new Set(
    event.participants.map((participant: { userId: string }) => participant.userId)
  );
  const existingInviteeIds = new Set(
    event.invites
      .filter(
        (invite: { status: string; inviteeId: string | null }) =>
          invite.status === "pending" || invite.status === "accepted"
      )
      .map((invite: { inviteeId: string | null }) => invite.inviteeId)
      .filter((value: string | null): value is string => Boolean(value))
  );

  const targetIds = friendIds.filter(
    (friendId) => !existingParticipantIds.has(friendId) && !existingInviteeIds.has(friendId)
  );

  if (targetIds.length === 0) {
    return NextResponse.json({ created: 0, mode: body.mode ?? "invite" });
  }

  const requestMode =
    body.mode === "request" ||
    (event.visibility === "private" && body.actorId !== event.ownerId) ||
    (event.status === "confirmed" && body.actorId !== event.ownerId);

  if (requestMode) {
    await Promise.all(
      targetIds.map((inviteeId) =>
        prisma.eventInviteRequest.upsert({
          where: {
            eventId_requesterId_inviteeId: {
              eventId: event.id,
              requesterId: body.actorId as string,
              inviteeId,
            },
          },
          update: {
            status: "pending",
          },
          create: {
            eventId: event.id,
            requesterId: body.actorId as string,
            inviteeId,
            status: "pending",
          },
        })
      )
    );

    await createAppNotification({
      userId: event.ownerId,
      type: "join_requested",
      title: "招待申請のお知らせ",
      body: `${actor.displayName}さんが ${targetIds.length} 名分の招待を申請しました。`,
      message: `${actor.displayName}さんが ${targetIds.length} 名分の招待を申請しました。`,
      eventId: event.id,
    });

    return NextResponse.json({
      created: targetIds.length,
      mode: "request",
    });
  }

  await prisma.eventInvite.createMany({
    data: targetIds.map((friendId) => ({
      eventId: event.id,
      inviterId: body.actorId as string,
      inviteeId: friendId,
      token: crypto.randomUUID(),
      status: "pending" as const,
    })),
  });

  await createAppNotifications(
    targetIds.map((friendId) => ({
      userId: friendId,
      type: "invite_received" as const,
      title: "イベント招待",
      body: `${actor.displayName}さんから「${event.purpose}」の招待が届きました。`,
      message: `${actor.displayName}さんから「${event.purpose}」の招待が届きました。`,
      eventId: event.id,
    }))
  );

  return NextResponse.json({
    created: targetIds.length,
    mode: "invite",
  });
}
