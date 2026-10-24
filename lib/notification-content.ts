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
  feature_announcement: "新機能のお知らせ",
};

export const notificationTypeIcon: Record<string, string> = {
  invite_received: "mail",
  event_confirmed: "verified",
  join_requested: "person_add",
  join_approved: "how_to_reg",
  friend_added: "group",
  feature_announcement: "celebration",
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

    if (type === "event_confirmed") {
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

  if (type === "feature_announcement") {
    // 現状の新機能告知はコミュニティ属性診断のみ。告知先が増えたらリンクをDBに持たせる
    return {
      actionHref: "/diagnosis",
      actionLabel: "診断をやってみる",
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
