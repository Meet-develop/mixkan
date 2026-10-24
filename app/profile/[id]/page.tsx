"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AvatarName, getAvatarToneClass, isImageAvatar } from "@/components/ui/avatar-name";
import { supabase } from "@/lib/supabase/client";
import { formatEventStartLabel } from "@/lib/datetime";
import { TypeBadge } from "@/components/features/diagnosis/type-badge";

type ProfileStats = {
  hostedCount: number;
  participatingCount: number;
  friendCount: number;
  completionRate: number;
};

type ProfileDetail = {
  userId: string;
  displayName: string;
  avatarIcon?: string | null;
  gender?: string;
  playFrequency?: string | null;
  drinkFrequency?: string | null;
  favoriteAreas?: string[];
  favoritePlaces?: string[];
  communityType?: string | null;
  stats?: ProfileStats;
};

type SharedEvent = {
  id: string;
  purpose: string;
  fixedStartTime?: string | null;
  startTime?: string | null;
  timeCandidates: { id: string; startTime: string; endTime: string; score: number }[];
  owner: { userId: string; displayName: string; avatarIcon?: string | null };
  createdAt: string;
};

const formatStart = (start?: string | null) => {
  if (!start) return "候補から決定";
  return formatEventStartLabel(start);
};

const defaultStats: ProfileStats = {
  hostedCount: 0,
  participatingCount: 0,
  friendCount: 0,
  completionRate: 0,
};

export default function FriendProfilePage() {
  const params = useParams();
  const userId = params.id as string;
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [sharedEvents, setSharedEvents] = useState<SharedEvent[]>([]);
  const [isSharedLoading, setIsSharedLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentViewerId = sessionData.session?.user?.id ?? null;
      setViewerId(currentViewerId);

      if (!currentViewerId) {
        setRequiresLogin(true);
        return;
      }

      const response = await fetch(
        `/api/profiles/${userId}?viewerId=${encodeURIComponent(currentViewerId)}`,
        { cache: "no-store" }
      );
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) return;
      const profileData = (await response.json()) as ProfileDetail;
      setProfile(profileData);
    };

    load();
  }, [userId]);

  useEffect(() => {
    if (!viewerId) return;

    let active = true;

    const loadSharedEvents = async () => {
      setIsSharedLoading(true);
      const response = await fetch(
        `/api/profiles/${userId}/shared-events?viewerId=${encodeURIComponent(viewerId)}`,
        { cache: "no-store" }
      );

      if (!response.ok || !active) {
        setIsSharedLoading(false);
        return;
      }

      const data = (await response.json()) as { sharedEvents?: SharedEvent[] };
      if (!active) return;
      setSharedEvents(data.sharedEvents ?? []);
      setIsSharedLoading(false);
    };

    loadSharedEvents();

    return () => {
      active = false;
    };
  }, [userId, viewerId]);

  const stats = useMemo(() => profile?.stats ?? defaultStats, [profile]);

  if (notFound) {
    return (
      <div className="min-h-screen px-6 py-20 text-center text-sm text-[var(--muted)]">
        プロフィールが見つかりません。
      </div>
    );
  }

  if (requiresLogin) {
    return (
      <div className="min-h-screen px-6 py-20 text-center text-sm text-[var(--muted)]">
        フレンドプロフィールを見るにはログインが必要です。
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="min-h-screen px-6 py-20 text-center text-sm text-[var(--muted)]">
        フレンドのみプロフィールを閲覧できます。
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen px-6 py-20 text-center text-sm text-[var(--muted)]">
        読み込み中...
      </div>
    );
  }

  const avatar = profile.avatarIcon?.trim() ?? "";
  const useImageAvatar = isImageAvatar(avatar);
  const avatarToneClass = getAvatarToneClass(profile.displayName.trim() || "user");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-orange-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-4xl sm:px-6">
          <Link
            href="/friends"
            aria-label="フレンド一覧へ戻る"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
          >
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">フレンドプロフィール</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 sm:max-w-4xl sm:px-6">
        <div className="rounded-3xl border border-orange-100/70 p-5">
          <div className="flex flex-col items-center text-center">
            <div
              className={`grid h-20 w-20 place-items-center overflow-hidden rounded-full text-4xl ${
                useImageAvatar || avatar ? "bg-orange-100" : avatarToneClass
              }`}
            >
              {useImageAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : avatar ? (
                avatar
              ) : (
                <span className="material-symbols-rounded text-[2rem]">person</span>
              )}
            </div>
            <h2 className="mt-3 text-xl font-semibold">{profile.displayName}</h2>
            {profile.communityType && (
              <div className="mt-2">
                <TypeBadge code={profile.communityType} linkable />
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <StatCell label="企画" value={stats.hostedCount} />
            <StatCell label="参加" value={stats.participatingCount} />
            <StatCell label="フレンド" value={stats.friendCount} />
          </div>

          <div className="mt-4 rounded-2xl bg-orange-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--muted)]">プロフィール充実度</p>
              <p className="text-sm font-semibold text-[var(--accent)]">{stats.completionRate}%</p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white">
              <div
                className="h-2 rounded-full bg-[var(--accent)]"
                style={{ width: `${stats.completionRate}%` }}
              />
            </div>
          </div>
        </div>

        <section className="mt-5 py-4">
          <h3 className="text-sm font-semibold">よく行くエリア</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {(profile.favoriteAreas ?? []).length === 0 ? (
              <p className="text-xs text-[var(--muted)]">未設定</p>
            ) : (
              (profile.favoriteAreas ?? []).map((area) => (
                <span key={area} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm">
                  {area}
                </span>
              ))
            )}
          </div>
        </section>

        <section className="py-4">
          <h3 className="text-sm font-semibold">好きなお店ジャンル</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {(profile.favoritePlaces ?? []).length === 0 ? (
              <p className="text-xs text-[var(--muted)]">未設定</p>
            ) : (
              (profile.favoritePlaces ?? []).map((genre) => (
                <span key={genre} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm">
                  {genre}
                </span>
              ))
            )}
          </div>
        </section>

        <section className="py-4">
          <h3 className="text-sm font-semibold">一緒に参加したイベント</h3>
          {isSharedLoading ? (
            <p className="mt-2 text-xs text-[var(--muted)]">読み込み中...</p>
          ) : sharedEvents.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--muted)]">まだ一緒に参加したイベントはありません。</p>
          ) : (
            <div className="mt-3 space-y-2">
              {sharedEvents.map((event) => {
                const primaryTime = event.fixedStartTime
                  ? formatStart(event.fixedStartTime)
                  : event.timeCandidates[0]
                    ? formatStart(event.timeCandidates[0].startTime)
                    : formatStart(event.startTime);

                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-100 text-[var(--accent)]">
                      <span className="material-symbols-rounded">event</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {event.purpose}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                        <AvatarName
                          displayName={event.owner.displayName}
                          avatarIcon={event.owner.avatarIcon}
                          className="max-w-[60%]"
                          textClassName="truncate"
                        />
                        <span>・{primaryTime}</span>
                      </div>
                    </div>
                    <span className="material-symbols-rounded text-[var(--accent)]">chevron_right</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#f7f4ef] px-2 py-3">
      <p className="text-sm font-semibold text-[var(--foreground)]">{value}</p>
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
    </div>
  );
}
