-- CreateEnum
CREATE TYPE "notification_category" AS ENUM ('invite', 'event_confirmed', 'reminder_day_before', 'reminder_hour_before', 'invite_reminder', 'participation', 'event_update', 'other');

-- AlterEnum


ALTER TYPE "notification_type" ADD VALUE 'event_updated';
ALTER TYPE "notification_type" ADD VALUE 'event_cancelled';
ALTER TYPE "notification_type" ADD VALUE 'join_declined';
ALTER TYPE "notification_type" ADD VALUE 'event_reminder_day_before';
ALTER TYPE "notification_type" ADD VALUE 'event_reminder_hour_before';
ALTER TYPE "notification_type" ADD VALUE 'invite_reminder';

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "category" "notification_category" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","category")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_type_event_id_idx" ON "notifications"("user_id", "type", "event_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Supabase の anon / authenticated ロールから直接参照されないよう RLS を有効化する
-- （アプリは Prisma 経由のサーバーサイドからのみアクセスするためポリシーは作成しない）
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
