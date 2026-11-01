import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAppOrigin } from "@/lib/site-url";
import type { NotificationType } from "@/lib/notification-categories";
import { categoryOf, planDelivery } from "@/lib/notification-routing";
import { sendWebPush, type PushMessage } from "@/lib/web-push";

export type NotificationPayload = {
  userId: string;
  type: NotificationType;
  title?: string | null;
  body?: string | null;
  message: string;
  eventId?: string | null;
};

type StoredNotification = NotificationPayload & { id: string };

type PushSubscriptionRow = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type DeliveryState = {
  disabledCategories: Set<string>;
  subscriptionsByUser: Map<string, PushSubscriptionRow[]>;
  lineUserIdByUser: Map<string, string>;
};

const resolveTitle = (payload: NotificationPayload) => payload.title?.trim() || "お知らせ";
const resolveBody = (payload: NotificationPayload) => payload.body?.trim() || payload.message;

const buildLineMessage = (payload: NotificationPayload) => {
  const title = resolveTitle(payload);
  const body = resolveBody(payload);
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

const pushOptionsByType: Partial<
  Record<NotificationType, { ttlSeconds: number; urgency: "normal" | "high" }>
> = {
  event_reminder_hour_before: { ttlSeconds: 60 * 60, urgency: "high" },
  event_reminder_day_before: { ttlSeconds: 60 * 60 * 12, urgency: "normal" },
};

const buildPushMessage = (notification: StoredNotification): PushMessage => ({
  title: resolveTitle(notification),
  body: resolveBody(notification),
  url: `/notifications/${notification.id}`,
  tag: notification.eventId ? `${notification.type}:${notification.eventId}` : notification.id,
});

const loadDeliveryState = async (userIds: string[]): Promise<DeliveryState> => {
  const uniqueUserIds = Array.from(new Set(userIds));

  const [disabledPreferences, subscriptions, profiles] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: { userId: { in: uniqueUserIds }, enabled: false },
      select: { userId: true, category: true },
    }),
    prisma.pushSubscription.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    }),
    prisma.profile.findMany({
      where: { userId: { in: uniqueUserIds }, lineUserId: { not: null } },
      select: { userId: true, lineUserId: true },
    }),
  ]);

  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
  for (const subscription of subscriptions) {
    const list = subscriptionsByUser.get(subscription.userId) ?? [];
    list.push(subscription);
    subscriptionsByUser.set(subscription.userId, list);
  }

  const lineUserIdByUser = new Map<string, string>();
  for (const profile of profiles) {
    const lineUserId = profile.lineUserId?.trim();
    if (lineUserId) lineUserIdByUser.set(profile.userId, lineUserId);
  }

  return {
    disabledCategories: new Set(
      disabledPreferences.map((preference) => `${preference.userId}:${preference.category}`)
    ),
    subscriptionsByUser,
    lineUserIdByUser,
  };
};

/**
 * ユーザーの全 Push 購読に送信し、失効した購読（404/410）は削除する。
 * @returns 失効していない購読が残っているか。false なら Push が無効になったとみなす
 */
const deliverPush = async (
  notification: StoredNotification,
  subscriptions: PushSubscriptionRow[],
  state: DeliveryState
) => {
  const message = buildPushMessage(notification);
  const options = pushOptionsByType[notification.type];

  const results = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      result: await sendWebPush(subscription, message, options),
    }))
  );

  const expiredIds = new Set(
    results
      .filter(({ result }) => result === "expired")
      .map(({ subscription }) => subscription.id)
  );

  if (expiredIds.size === 0) return true;

  await prisma.pushSubscription.deleteMany({ where: { id: { in: Array.from(expiredIds) } } });

  const remaining = subscriptions.filter((subscription) => !expiredIds.has(subscription.id));
  if (remaining.length > 0) {
    state.subscriptionsByUser.set(notification.userId, remaining);
    return true;
  }

  state.subscriptionsByUser.delete(notification.userId);
  return false;
};

const deliverExternally = async (
  notification: StoredNotification,
  state: DeliveryState
) => {
  const lineUserId = state.lineUserIdByUser.get(notification.userId);
  const categoryEnabled = !state.disabledCategories.has(
    `${notification.userId}:${categoryOf(notification.type)}`
  );
  const subscriptions = state.subscriptionsByUser.get(notification.userId) ?? [];

  const plan = planDelivery({
    type: notification.type,
    categoryEnabled,
    hasPushSubscription: subscriptions.length > 0,
    lineLinked: Boolean(lineUserId),
  });

  let shouldSendLine = plan.line;

  if (plan.push) {
    const pushStillActive = await deliverPush(notification, subscriptions, state);
    if (!pushStillActive) {
      // すべての購読が失効 → Push 無効扱いとして LINE にフォールバックする
      shouldSendLine = planDelivery({
        type: notification.type,
        categoryEnabled,
        hasPushSubscription: false,
        lineLinked: Boolean(lineUserId),
      }).line;
    }
  }

  if (shouldSendLine && lineUserId) {
    await pushLineMessage(lineUserId, buildLineMessage(notification));
  }
};

const deliverAll = async (notifications: StoredNotification[]) => {
  if (notifications.length === 0) return;

  let state: DeliveryState;
  try {
    state = await loadDeliveryState(notifications.map((notification) => notification.userId));
  } catch (error) {
    console.error("Failed to load notification delivery state", error);
    return;
  }

  // 購読失効の反映が同一ユーザー内で順序通りに効くよう、ユーザー単位では直列に送る
  const byUser = new Map<string, StoredNotification[]>();
  for (const notification of notifications) {
    const list = byUser.get(notification.userId) ?? [];
    list.push(notification);
    byUser.set(notification.userId, list);
  }

  await Promise.all(
    Array.from(byUser.values()).map(async (userNotifications) => {
      for (const notification of userNotifications) {
        try {
          await deliverExternally(notification, state);
        } catch (error) {
          console.error("Failed to deliver notification", {
            notificationId: notification.id,
            type: notification.type,
            error,
          });
        }
      }
    })
  );
};

const toStored = (payload: NotificationPayload): StoredNotification => ({
  ...payload,
  id: randomUUID(),
});

const toCreateData = (notification: StoredNotification) => ({
  id: notification.id,
  userId: notification.userId,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  message: notification.message,
  eventId: notification.eventId,
});

export const createAppNotification = async (payload: NotificationPayload) => {
  const notification = toStored(payload);
  const created = await prisma.notification.create({ data: toCreateData(notification) });

  await deliverAll([notification]);

  return created;
};

export const createAppNotifications = async (payloads: NotificationPayload[]) => {
  if (payloads.length === 0) {
    return;
  }

  const notifications = payloads.map(toStored);

  await prisma.notification.createMany({ data: notifications.map(toCreateData) });

  await deliverAll(notifications);
};
