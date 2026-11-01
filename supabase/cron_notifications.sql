-- Supabase SQL editor で実行する想定
-- リマインド通知（前日・1時間前・招待未回答）の cron API を 10 分毎に呼び出す。
--
-- 事前準備:
--   1. Database > Extensions で pg_cron と pg_net を有効化する
--   2. Vercel の環境変数 CRON_SECRET と同じ値を Vault に登録する
--        select vault.create_secret('<CRON_SECRET の値>', 'mixkan_cron_secret');
--   3. 下記 URL を本番ドメインに置き換えて実行する

select cron.schedule(
  'mixkan-notification-reminders',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'https://<本番ドメイン>/api/cron/notifications',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mixkan_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- 停止する場合:
-- select cron.unschedule('mixkan-notification-reminders');
