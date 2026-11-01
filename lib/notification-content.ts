export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  eventId?: string | null;
  createdAt: Date | string;
  readAt?: Date | string | null;
  actionHref?: string;
  actionLabel?: string;
};

type NotificationInput = {
  id: string;
  type: string;
  title?: string | null;
  body?: string | null;
  message: string;
  eventId?: string | null;
  createdAt: Date | string;
  readAt?: Date | string | null;
};

const defaultTitleByType: Record<string, string> = {
  invite_received: "イベント招待",
  event_confirmed: "開催情報のお知らせ",
  join_requested: "参加申請のお知らせ",
  join_approved: "参加承認のお知らせ",
  friend_added: "プロフィール登録のお願い",
  event_updated: "イベント情報の更新",
  event_cancelled: "イベント中止のお知らせ",
  join_declined: "参加申請の結果",
  event_reminder_day_before: "明日のイベント",
  event_reminder_hour_before: "まもなく開始",
  invite_reminder: "招待への回答のお願い",
};

export const notificationTypeIcon: Record<string, string> = {
  invite_received: "mail",
  event_confirmed: "verified",
  join_requested: "person_add",
  join_approved: "how_to_reg",
  friend_added: "group",
  event_updated: "edit_calendar",
  event_cancelled: "event_busy",
  join_declined: "person_off",
  event_reminder_day_before: "event_upcoming",
  event_reminder_hour_before: "alarm",
  invite_reminder: "pending_actions",
};

const resolveNotificationAction = (
  type: string,
  eventId?: string | null
): { actionHref?: string; actionLabel?: string } => {
  if (eventId) {
    if (type === "join_requested") {
      return {
        actionHref: `/events/${eventId}/manage`,
        actionLabel: "申請を確認する",
      };
    }

    if (type === "invite_received" || type === "invite_reminder") {
      return {
        actionHref: `/events/${eventId}`,
        actionLabel: "招待に回答する",
      };
    }

    if (
      type === "event_confirmed" ||
      type === "event_reminder_day_before" ||
      type === "event_reminder_hour_before"
    ) {
      return {
        actionHref: `/events/${eventId}`,
        actionLabel: "開催情報を見る",
      };
    }

    return {
      actionHref: `/events/${eventId}`,
      actionLabel: "イベントを見る",
    };
  }

  if (type === "friend_added") {
    return {
      actionHref: "/profile/setup",
      actionLabel: "プロフィール設定へ",
    };
  }

  return {};
};

export const toNotificationView = (
  notification: NotificationInput
): NotificationView => {
  const title =
    notification.title?.trim() || defaultTitleByType[notification.type] || "お知らせ";
  const body = notification.body?.trim() || notification.message;
  const action = resolveNotificationAction(notification.type, notification.eventId);

  return {
    id: notification.id,
    type: notification.type,
    title,
    body,
    eventId: notification.eventId,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    ...action,
  };
};
