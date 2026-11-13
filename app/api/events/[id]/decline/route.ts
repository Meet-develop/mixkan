import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAppNotification } from "@/lib/notification-delivery";

type DeclineJoinRequestBody = {
  ownerId?: string;
  userId?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as DeclineJoinRequestBody;

  if (!body.ownerId || !body.userId) {
    return NextResponse.json(
      { error: "ownerId and userId are required" },
      { status: 400 }
    );
  }

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, ownerId: true, purpose: true },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  if (event.ownerId !== body.ownerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const participant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId: id, userId: body.userId } },
  });

  if (!participant || participant.status !== "requested") {
    return NextResponse.json(
      { error: "Requested participant not found" },
      { status: 404 }
    );
  }

  await prisma.eventParticipant.update({
    where: { eventId_userId: { eventId: id, userId: body.userId } },
    data: { status: "declined" },
  });

  const owner = await prisma.profile.findUnique({
    where: { userId: body.ownerId },
    select: { displayName: true },
  });

  const ownerName = owner?.displayName ?? "オーナー";

  await createAppNotification({
    userId: body.userId,
    type: "join_declined",
    title: "参加申請は非承認となりました",
    body: `${ownerName}さんが「${event.purpose}」への参加申請を見送りました。`,
    message: `${ownerName}さんが「${event.purpose}」への参加申請を見送りました。`,
    eventId: event.id,
  });

  return NextResponse.json({ success: true });
}
