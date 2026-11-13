// 通知タイプ・カテゴリーの定義（クライアント/サーバー共通。Prisma に依存させないこと）

export const NOTIFICATION_TYPES = [
  "invite_received",
  "invite_reminder",
  "event_confirmed",
  "event_cancelled",
  "event_updated",
  "event_reminder_day_before",
  "event_reminder_hour_before",
  "join_requested",
  "join_approved",
  "join_declined",
  "friend_added",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CATEGORIES = [
  "invite",
  "event_confirmed",
  "reminder_day_before",
  "reminder_hour_before",
  "invite_reminder",
  "participation",
  "event_update",
  "other",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const isNotificationCategory = (value: unknown): value is NotificationCategory =>
  typeof value === "string" &&
  (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);

export const notificationCategoryByType: Record<NotificationType, NotificationCategory> = {
  invite_received: "invite",
  invite_reminder: "invite_reminder",
  event_confirmed: "event_confirmed",
  event_cancelled: "event_confirmed",
  event_updated: "event_update",
  event_reminder_day_before: "reminder_day_before",
  event_reminder_hour_before: "reminder_hour_before",
  join_requested: "participation",
  join_approved: "participation",
  join_declined: "participation",
  friend_added: "other",
};

/**
 * LINE に送る必要最低限の通知タイプ。
 * LINE は Push 通知の購読が 1 件も無いユーザーにのみ送信する。
 */
export const LINE_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  "invite_received",
  "event_confirmed",
  "event_cancelled",
]);

export type NotificationCategoryMeta = {
  category: NotificationCategory;
  label: string;
  description: string;
  icon: string;
  /** Push 未設定時に LINE でも届くカテゴリーか */
  lineSupported: boolean;
};

export const NOTIFICATION_CATEGORY_GROUPS: Array<{
  title: string;
  items: NotificationCategoryMeta[];
}> = [
  {
    title: "イベント",
    items: [
      {
        category: "invite",
        label: "イベントへの招待",
        description: "フレンドからイベントに招待されたとき",
        icon: "mail",
        lineSupported: true,
      },
      {
        category: "event_confirmed",
        label: "開催確定・中止",
        description: "日時・場所が確定/変更されたとき、イベントが中止されたとき",
        icon: "verified",
        lineSupported: true,
      },
      {
        category: "event_update",
        label: "イベント内容の更新",
        description: "参加中のイベントの内容が編集されたとき",
        icon: "edit_calendar",
        lineSupported: false,
      },
      {
        category: "participation",
        label: "参加申請・承認",
        description: "参加申請が届いたとき、申請が承認/見送りされたとき",
        icon: "how_to_reg",
        lineSupported: false,
      },
    ],
  },
  {
    title: "リマインド",
    items: [
      {
        category: "reminder_day_before",
        label: "前日リマインド",
        description: "参加するイベントの開始 24 時間前",
        icon: "event_upcoming",
        lineSupported: false,
      },
      {
        category: "reminder_hour_before",
        label: "1時間前リマインド",
        description: "参加するイベントの開始 1 時間前",
        icon: "alarm",
        lineSupported: false,
      },
      {
        category: "invite_reminder",
        label: "未回答の招待",
        description: "招待に 24 時間回答していないとき",
        icon: "pending_actions",
        lineSupported: false,
      },
    ],
  },
  {
    title: "その他",
    items: [
      {
        category: "other",
        label: "その他のお知らせ",
        description: "プロフィール登録のお願いなど",
        icon: "notifications",
        lineSupported: false,
      },
    ],
  },
];

export type NotificationPreferencesResponse = {
  preferences: Record<NotificationCategory, boolean>;
  pushSubscriptionCount: number;
  lineLinked: boolean;
  /** LINE 通知が現在有効か（LINE 連携済み かつ Push 購読なし） */
  lineActive: boolean;
};
