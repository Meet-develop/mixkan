-- 全 public テーブルで RLS を有効化する。
-- ポリシーは付けない(deny-all): PostgREST 経由の anon / authenticated は全拒否になる。
-- Prisma は BYPASSRLS を持つロール(postgres)で接続するため影響を受けない。
-- FORCE ROW LEVEL SECURITY は付けないこと(オーナーにも効いて Prisma が止まる)。
-- ロールバック: ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;

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
ALTER TABLE "_prisma_migrations"     ENABLE ROW LEVEL SECURITY;
