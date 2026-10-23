import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildInviteReceivedNotification,
  createAppNotification,
} from "@/lib/notification-delivery";

type InviteRequestDecisionBody = {
  ownerId?: string;
  requesterId?: string;
  inviteeId?: string;
  decision?: "approve" | "decline";
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as InviteRequestDecisionBody;

  if (!body.ownerId || !body.requesterId || !body.inviteeId || !body.decision) {
    return NextResponse.json(
      { message: "ownerId, requesterId, inviteeId and decision are required" },
      { status: 400 }
    );
  }

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      ownerId: true,
      purpose: true,
      participants: {
        select: {
          userId: true,
          status: true,
        },
      },
      invites: {
        select: {
          inviteeId: true,
          status: true,
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ message: "Event not found" }, { status: 404 });
  }

  if (event.ownerId !== body.ownerId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const requestRecord = await prisma.eventInviteRequest.findUnique({
    where: {
      eventId_requesterId_inviteeId: {
        eventId: id,
        requesterId: body.requesterId,
        inviteeId: body.inviteeId,
      },
    },
  });

  if (!requestRecord || requestRecord.status !== "pending") {
    return NextResponse.json({ message: "Pending invite request not found" }, { status: 404 });
  }

  const requester = await prisma.profile.findUnique({
    where: { userId: body.requesterId },
    select: { displayName: true },
  });

  if (body.decision === "approve") {
    const isParticipant = event.participants.some(
      (participant: { userId: string; status: string }) =>
        participant.userId === body.inviteeId &&
        participant.status !== "declined" &&
        participant.status !== "cancelled"
    );
    const isAlreadyInvited = event.invites.some(
      (invite: { inviteeId: string | null; status: string }) =>
        invite.inviteeId === body.inviteeId &&
        (invite.status === "pending" || invite.status === "accepted")
    );

    await prisma.eventInviteRequest.update({
      where: { id: requestRecord.id },
      data: { status: "accepted" },
    });

    if (!isParticipant && !isAlreadyInvited) {
      await prisma.eventInvite.create({
        data: {
          eventId: id,
          inviterId: body.requesterId,
          inviteeId: body.inviteeId,
          token: crypto.randomUUID(),
          status: "pending",
        },
      });

      await createAppNotification(
        buildInviteReceivedNotification({
          userId: body.inviteeId,
          inviterName: requester?.displayName ?? "参加者",
          eventPurpose: event.purpose,
          eventId: id,
        })
      );
    }

    await createAppNotification({
      userId: body.requesterId,
      type: "join_approved",
      title: "招待申請が承認されました",
      body: `「${event.purpose}」の招待申請が承認されました。`,
      message: `「${event.purpose}」の招待申請が承認されました。`,
      eventId: id,
    });

    return NextResponse.json({ success: true, status: "accepted" });
  }

  await prisma.eventInviteRequest.update({
    where: { id: requestRecord.id },
    data: { status: "declined" },
  });

  await createAppNotification({
    userId: body.requesterId,
    type: "join_approved",
    title: "招待申請は非承認となりました",
    body: `「${event.purpose}」の招待申請は見送られました。`,
    message: `「${event.purpose}」の招待申請は見送られました。`,
    eventId: id,
  });

  return NextResponse.json({ success: true, status: "declined" });
}
