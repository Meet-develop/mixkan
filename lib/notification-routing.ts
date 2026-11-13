import {
  LINE_NOTIFICATION_TYPES,
  notificationCategoryByType,
  type NotificationType,
} from "@/lib/notification-categories";

export type DeliveryContext = {
  type: NotificationType;
  /** 該当カテゴリーをユーザーが ON にしているか */
  categoryEnabled: boolean;
  /** 有効な Push 購読を 1 件以上持っているか */
  hasPushSubscription: boolean;
  /** LINE 連携済みか */
  lineLinked: boolean;
};

export type DeliveryPlan = {
  push: boolean;
  line: boolean;
};

/**
 * 外部チャネル（Push / LINE）への配信方針を決める。
 * - カテゴリーが OFF なら外部チャネルには送らない（アプリ内通知は常に残す）
 * - Push 購読がある場合は Push のみ（LINE は停止）
 * - Push 購読が無い場合は、必要最低限のタイプのみ LINE に送る
 */
export const planDelivery = (context: DeliveryContext): DeliveryPlan => {
  if (!context.categoryEnabled) {
    return { push: false, line: false };
  }

  if (context.hasPushSubscription) {
    return { push: true, line: false };
  }

  return {
    push: false,
    line: context.lineLinked && LINE_NOTIFICATION_TYPES.has(context.type),
  };
};

export const categoryOf = (type: NotificationType) => notificationCategoryByType[type];
