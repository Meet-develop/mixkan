import { prisma } from "@/lib/prisma";
import { formatEventStartLabel } from "@/lib/datetime";
import { createAppNotifications, type NotificationPayload } from "@/lib/notification-delivery";
import {
  DAY_BEFORE_WINDOW_MS,
  INVITE_REMINDER_AFTER_MS,
  INVITE_REMINDER_MAX_AGE_MS,
  formatMinutesUntil,
  reminderDedupeSince,
  resolveEventReminderKind,
  shouldSkipDayBeforeReminder,
} from "@/lib/notification-reminder-rules";

const HOUR_MS = 60 * 60 * 1000;

const reminderTypeByKind = {
  day_before: "event_reminder_day_before",
  hour_before: "event_reminder_hour_before",
} as const;

const key = (userId: string, eventId: string) => `${userId}:${eventId}`;

const buildEventReminders = async (now: Date): Promise<NotificationPayload[]> => {
  const events = await prisma.event.findMany({
    where: {
      status: { in: ["open", "confirmed"] },
      fixedStartTime: {
        gt: now,
        lte: new Date(now.getTime() + DAY_BEFORE_WINDOW_MS),
      },
    },
    select: {
      id: true,
      ownerId: true,
      purpose: true,
      fixedStartTime: true,
      fixedPlaceName: true,
      participants: {
        where: { status: "approved" },
        select: { userId: true },
      },
    },
  });

  if (events.length === 0) return [];

  const eventIds = events.map((event) => event.id);

  const recentNotifications = await prisma.notification.findMany({
    where: {
      eventId: { in: eventIds },
      type: {
        in: ["event_reminder_day_before", "event_reminder_hour_before", "event_confirmed"],
      },
      createdAt: { gte: new Date(now.getTime() - DAY_BEFORE_WINDOW_MS - 2 * HOUR_MS) },
    },
    select: { userId: true, eventId: true, type: true, createdAt: true },
  });

  const latestByTypeAndKey = new Map<string, Date>();
  for (const notification of recentNotifications) {
    if (!notification.eventId) continue;
    const mapKey = `${notification.type}:${key(notification.userId, notification.eventId)}`;
    const current = latestByTypeAndKey.get(mapKey);
    if (!current || current < notification.createdAt) {
      latestByTypeAndKey.set(mapKey, notification.createdAt);
    }
  }

  const payloads: NotificationPayload[] = [];

  for (const event of events) {
    const startTime = event.fixedStartTime;
    if (!startTime) continue;

    const kind = resolveEventReminderKind(startTime, now);
    if (!kind) continue;

    const type = reminderTypeByKind[kind];
    const dedupeSince = reminderDedupeSince(startTime, kind);
    const recipients = new Set([
      event.ownerId,
      ...event.participants.map((participant) => participant.userId),
    ]);

    const startLabel = formatEventStartLabel(startTime, true);
    const placeText = event.fixedPlaceName ? `\n場所: ${event.fixedPlaceName}` : "";

    for (const userId of recipients) {
      const lastSent = latestByTypeAndKey.get(`${type}:${key(userId, event.id)}`);
      if (lastSent && lastSent >= dedupeSince) continue;

      if (
        kind === "day_before" &&
        shouldSkipDayBeforeReminder(
          startTime,
          latestByTypeAndKey.get(`event_confirmed:${key(userId, event.id)}`)
        )
      ) {
        continue;
      }

      const message =
        kind === "day_before"
          ? `「${event.purpose}」は ${startLabel} 開始です。${placeText}`
          : `「${event.purpose}」はあと${formatMinutesUntil(startTime, now)}で開始です（${startLabel}）。${placeText}`;

      payloads.push({
        userId,
        type,
        title: kind === "day_before" ? "明日はイベントの日です" : "まもなくイベントが始まります",
        body: message,
        message,
        eventId: event.id,
      });
    }
  }

  return payloads;
};

const buildInviteReminders = async (now: Date): Promise<NotificationPayload[]> => {
  const invites = await prisma.eventInvite.findMany({
    where: {
      status: "pending",
      inviteeId: { not: null },
      createdAt: {
        lte: new Date(now.getTime() - INVITE_REMINDER_AFTER_MS),
        gte: new Date(now.getTime() - INVITE_REMINDER_MAX_AGE_MS),
      },
      event: {
        status: { in: ["open", "confirmed"] },
        OR: [{ fixedStartTime: null }, { fixedStartTime: { gt: now } }],
      },
    },
    select: {
      eventId: true,
      inviteeId: true,
      inviter: { select: { displayName: true } },
      event: {
        select: {
          purpose: true,
          participants: {
            where: { status: { in: ["approved", "requested"] } },
            select: { userId: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (invites.length === 0) return [];

  const alreadyReminded = await prisma.notification.findMany({
    where: {
      type: "invite_reminder",
      eventId: { in: Array.from(new Set(invites.map((invite) => invite.eventId))) },
    },
    select: { userId: true, eventId: true },
  });

  const handled = new Set(
    alreadyReminded
      .filter((notification) => notification.eventId)
      .map((notification) => key(notification.userId, notification.eventId as string))
  );

  const payloads: NotificationPayload[] = [];

  for (const invite of invites) {
    const inviteeId = invite.inviteeId;
    if (!inviteeId) continue;

    const inviteKey = key(inviteeId, invite.eventId);
    if (handled.has(inviteKey)) continue;
    handled.add(inviteKey);

    const alreadyAnswered = invite.event.participants.some(
      (participant) => participant.userId === inviteeId
    );
    if (alreadyAnswered) continue;

    const inviterName = invite.inviter.displayName;
    const message = `${inviterName}さんからの「${invite.event.purpose}」の招待にまだ回答していません。参加できるか回答しましょう。`;

    payloads.push({
      userId: inviteeId,
      type: "invite_reminder",
      title: "招待への回答をお待ちしています",
      body: message,
      message,
      eventId: invite.eventId,
    });
  }

  return payloads;
};

export type ReminderRunResult = {
  eventReminders: number;
  inviteReminders: number;
};

export const runNotificationReminders = async (now = new Date()): Promise<ReminderRunResult> => {
  const [eventReminders, inviteReminders] = await Promise.all([
    buildEventReminders(now),
    buildInviteReminders(now),
  ]);

  await createAppNotifications([...eventReminders, ...inviteReminders]);

  return {
    eventReminders: eventReminders.length,
    inviteReminders: inviteReminders.length,
  };
};
