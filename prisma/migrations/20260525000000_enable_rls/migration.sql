-- public の全テーブルで RLS を有効化する。
-- profiles は supabase/profiles_rls.sql の own-row ポリシーを併用する(ここでの ENABLE は冪等)。
-- それ以外のテーブルにはポリシーを付けず deny-all とする:
--   PostgREST 経由の anon / authenticated は読み書きできない。
-- Prisma は BYPASSRLS を持つロール(postgres)で接続するため影響を受けない。
--
-- FORCE ROW LEVEL SECURITY は付けないこと。
--   BYPASSRLS を持たないオーナーロールで接続すると、ポリシーなしで全拒否になるため
--   (現行の postgres は影響しないが、ロール変更時のリスクを避ける)。
-- ロールバック: ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;
--   ただし profiles は対象外(ポリシーで保護されているため DISABLE しない)。

ALTER TABLE "profiles"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "friendships"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "favorite_friends"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_participants"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_invites"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_invite_requests"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_time_candidates"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_place_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_time_votes"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_place_votes"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "place_cache"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications"          ENABLE ROW LEVEL SECURITY;

-- _prisma_migrations は migrate deploy では存在するが、migrate dev の shadow DB には
-- 存在しないため、あるときだけ有効化する。
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
