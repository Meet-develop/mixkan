-- コミュニティ属性診断(16タイプ)の結果をプロフィールに保持する
ALTER TABLE "profiles"
ADD COLUMN "community_type" TEXT,
ADD COLUMN "community_axis_scores" JSONB,
ADD COLUMN "community_diagnosed_at" TIMESTAMPTZ(6);

-- 新機能告知用の通知タイプを追加
-- NOTE: 追加した enum 値は同一トランザクション内では使用できないため、
-- このマイグレーションではスキーマ変更のみ行う(告知の配信はデプロイ後にスクリプトで実行)
ALTER TYPE "notification_type" ADD VALUE 'feature_announcement';
