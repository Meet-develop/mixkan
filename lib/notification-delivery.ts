import { prisma } from "@/lib/prisma";
import { getAppOrigin } from "@/lib/site-url";
import { ensureLineUserIdLinked } from "@/lib/line-user";

type NotificationPayload = {
  userId: string;
  type: "event_confirmed" | "invite_received" | "join_requested" | "join_approved" | "friend_added";
  title?: string | null;
  body?: string | null;
  message: string;
  eventId?: string | null;
};

const buildLineMessage = (payload: NotificationPayload) => {
  const title = payload.title?.trim() || "お知らせ";
  const body = payload.body?.trim() || payload.message;
  const origin = getAppOrigin();
  const eventLink = payload.eventId && origin ? `${origin}/events/${payload.eventId}` : null;

  return eventLink
    ? `${title}\n${body}\n\n詳細: ${eventLink}`
    : `${title}\n${body}`;
};

const pushLineMessage = async (lineUserId: string, text: string) => {
  const channelAccessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim();
  if (!channelAccessToken) return;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [
        {
          type: "text",
          text,
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LINE push failed: ${response.status} ${detail}`);
  }
};

const deliverToLineIfLinked = async (payload: NotificationPayload) => {
  const channelAccessToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim();
  if (!channelAccessToken) return;

  const profile = await prisma.profile.findUnique({
    where: { userId: payload.userId },
    select: { lineUserId: true },
  });
  if (!profile) return;

  const lineUserId =
    profile.lineUserId?.trim() || (await ensureLineUserIdLinked(payload.userId));
  if (!lineUserId) return;

  const text = buildLineMessage(payload);
  await pushLineMessage(lineUserId, text);
};

export const buildInviteReceivedNotification = ({
  userId,
  inviterName,
  eventPurpose,
  eventId,
}: {
  userId: string;
  inviterName: string;
  eventPurpose: string;
  eventId: string;
}): NotificationPayload => {
  const message = `${inviterName}さんから「${eventPurpose}」の招待が届きました。`;
  return {
    userId,
    type: "invite_received",
    title: "イベント招待",
    body: message,
    message,
    eventId,
  };
};

export const createAppNotification = async (payload: NotificationPayload) => {
  const created = await prisma.notification.create({
    data: {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      message: payload.message,
      eventId: payload.eventId,
    },
  });

  try {
    await deliverToLineIfLinked(payload);
  } catch (error) {
    console.error("Failed to deliver LINE notification", error);
  }

  return created;
};

export const createAppNotifications = async (payloads: NotificationPayload[]) => {
  if (payloads.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: payloads.map((payload) => ({
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      message: payload.message,
      eventId: payload.eventId,
    })),
  });

  await Promise.all(
    payloads.map(async (payload) => {
      try {
        await deliverToLineIfLinked(payload);
      } catch (error) {
        console.error("Failed to deliver LINE notification", error);
      }
    })
  );
};
