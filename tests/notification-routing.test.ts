import assert from "node:assert/strict";
import { planDelivery } from "../lib/notification-routing";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_GROUPS,
  NOTIFICATION_TYPES,
  notificationCategoryByType,
} from "../lib/notification-categories";
import {
  formatMinutesUntil,
  reminderDedupeSince,
  resolveEventReminderKind,
  shouldSkipDayBeforeReminder,
} from "../lib/notification-reminder-rules";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-11-01T03:00:00.000Z");
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

// --- planDelivery ---------------------------------------------------------

// Push 購読あり → Push のみ、LINE は停止
assert.deepEqual(
  planDelivery({ type: "invite_received", categoryEnabled: true, hasPushSubscription: true, lineLinked: true }),
  { push: true, line: false }
);

// Push 購読なし → 必須タイプのみ LINE
for (const type of ["invite_received", "event_confirmed", "event_cancelled"] as const) {
  assert.deepEqual(
    planDelivery({ type, categoryEnabled: true, hasPushSubscription: false, lineLinked: true }),
    { push: false, line: true },
    type
  );
}

// Push 購読なし → 必須でないタイプは LINE にも送らない
for (const type of [
  "event_updated",
  "event_reminder_day_before",
  "event_reminder_hour_before",
  "invite_reminder",
  "join_requested",
  "join_approved",
  "join_declined",
  "friend_added",
] as const) {
  assert.deepEqual(
    planDelivery({ type, categoryEnabled: true, hasPushSubscription: false, lineLinked: true }),
    { push: false, line: false },
    type
  );
}

// LINE 未連携なら送らない
assert.deepEqual(
  planDelivery({ type: "invite_received", categoryEnabled: true, hasPushSubscription: false, lineLinked: false }),
  { push: false, line: false }
);

// カテゴリー OFF なら Push も LINE も送らない
assert.deepEqual(
  planDelivery({ type: "invite_received", categoryEnabled: false, hasPushSubscription: true, lineLinked: true }),
  { push: false, line: false }
);
assert.deepEqual(
  planDelivery({ type: "event_confirmed", categoryEnabled: false, hasPushSubscription: false, lineLinked: true }),
  { push: false, line: false }
);

// --- カテゴリー定義の整合性 -------------------------------------------------

for (const type of NOTIFICATION_TYPES) {
  assert.ok(NOTIFICATION_CATEGORIES.includes(notificationCategoryByType[type]), type);
}
const listedCategories = NOTIFICATION_CATEGORY_GROUPS.flatMap((group) =>
  group.items.map((item) => item.category)
);
assert.deepEqual([...listedCategories].sort(), [...NOTIFICATION_CATEGORIES].sort());

// --- リマインド判定 ---------------------------------------------------------

assert.equal(resolveEventReminderKind(at(-1), now), null);
assert.equal(resolveEventReminderKind(at(0), now), null);
assert.equal(resolveEventReminderKind(at(30 * 60 * 1000), now), "hour_before");
assert.equal(resolveEventReminderKind(at(HOUR), now), "hour_before");
assert.equal(resolveEventReminderKind(at(HOUR + 1), now), "day_before");
assert.equal(resolveEventReminderKind(at(24 * HOUR), now), "day_before");
assert.equal(resolveEventReminderKind(at(24 * HOUR + 1), now), null);

// 送信済み判定の基準: 開始 1 時間前リマインドは開始 2 時間前以降、前日リマインドは開始 25 時間前以降
const start = at(10 * HOUR);
assert.equal(reminderDedupeSince(start, "hour_before").getTime(), start.getTime() - 2 * HOUR);
assert.equal(reminderDedupeSince(start, "day_before").getTime(), start.getTime() - 25 * HOUR);

// 開始 24 時間以内に確定通知を受け取っていれば前日リマインドは省略
assert.equal(shouldSkipDayBeforeReminder(start, at(-HOUR)), true);
assert.equal(shouldSkipDayBeforeReminder(start, at(-20 * HOUR)), false);
assert.equal(shouldSkipDayBeforeReminder(start, null), false);

assert.equal(formatMinutesUntil(at(60 * HOUR / 60), now), "1時間");
assert.equal(formatMinutesUntil(at(45 * 60 * 1000), now), "45分");
assert.equal(formatMinutesUntil(at(10 * 1000), now), "1分");

console.log("notification-routing tests passed");
