// リマインド送信タイミングの判定（DB に依存しない純粋関数。tests/ から検証する）

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const HOUR_BEFORE_WINDOW_MS = HOUR_MS;
export const DAY_BEFORE_WINDOW_MS = 24 * HOUR_MS;
/** 招待から何時間未回答でリマインドするか */
export const INVITE_REMINDER_AFTER_MS = 24 * HOUR_MS;
/** これより古い招待にはリマインドしない（初回デプロイ時の一斉送信を防ぐ） */
export const INVITE_REMINDER_MAX_AGE_MS = 7 * 24 * HOUR_MS;

export type EventReminderKind = "day_before" | "hour_before";

/**
 * 開始時刻に対して、いま送るべきリマインドの種類を返す。
 * - 開始 1 時間前〜開始まで: hour_before
 * - 開始 24 時間前〜1 時間前: day_before
 * cron の実行間隔に依存しないよう「窓」で判定し、送信済みかどうかは呼び出し側で判定する。
 */
export const resolveEventReminderKind = (
  startTime: Date,
  now: Date
): EventReminderKind | null => {
  const remaining = startTime.getTime() - now.getTime();
  if (remaining <= 0) return null;
  if (remaining <= HOUR_BEFORE_WINDOW_MS) return "hour_before";
  if (remaining <= DAY_BEFORE_WINDOW_MS) return "day_before";
  return null;
};

/**
 * 同じリマインドを既に送ったか判定する基準時刻。
 * これ以降に同種のリマインドが作成されていれば送信済みとみなす。
 * （開始時刻が大きく変更された場合は再送されるよう、開始時刻基準で区切る）
 */
export const reminderDedupeSince = (startTime: Date, kind: EventReminderKind) =>
  new Date(
    startTime.getTime() -
      (kind === "hour_before" ? HOUR_BEFORE_WINDOW_MS : DAY_BEFORE_WINDOW_MS) -
      HOUR_MS
  );

/**
 * 前日リマインドを省略すべきか。
 * 開始 24 時間以内に開催確定通知を受け取っている場合は、直近で案内済みのため送らない。
 */
export const shouldSkipDayBeforeReminder = (
  startTime: Date,
  confirmedNotifiedAt: Date | null | undefined
) =>
  Boolean(
    confirmedNotifiedAt &&
      confirmedNotifiedAt.getTime() >= startTime.getTime() - DAY_BEFORE_WINDOW_MS
  );

export const formatMinutesUntil = (startTime: Date, now: Date) => {
  const minutes = Math.max(1, Math.round((startTime.getTime() - now.getTime()) / MINUTE_MS));
  return minutes >= 60 ? "1時間" : `${minutes}分`;
};
