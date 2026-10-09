"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getAvatarToneClass, isImageAvatar } from "@/components/ui/avatar-name";
type Friend = {
  userId: string;
  displayName: string;
  avatarIcon?: string | null;
  area?: string | null;
  isFavorite?: boolean;
  communities?: { id: string; name: string }[];
};

type Favorite = { userId: string; displayName: string; avatarIcon?: string | null };
type Community = { id: string; name: string };

export default function FriendsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunityFilter, setSelectedCommunityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const loadData = async (currentUserId: string) => {
    const [friendsResponse, favoritesResponse, communitiesResponse] = await Promise.all([
      fetch(`/api/friends?userId=${currentUserId}`),
      fetch(`/api/favorites?userId=${currentUserId}`),
      fetch(`/api/communities?userId=${currentUserId}&userOnly=true`),
    ]);

    if (friendsResponse.ok) {
      setFriends((await friendsResponse.json()) as Friend[]);
    }
    if (favoritesResponse.ok) {
      setFavorites((await favoritesResponse.json()) as Favorite[]);
    }
    if (communitiesResponse.ok) {
      setCommunities((await communitiesResponse.json()) as Community[]);
    }
  };

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUserId = data.session?.user?.id ?? null;
      setUserId(currentUserId);
      if (currentUserId) {
        loadData(currentUserId);
      }
    };

    loadUser();
  }, []);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((favorite) => favorite.userId)),
    [favorites]
  );

  const filteredFriends = useMemo(() => {
    let result = friends;
    if (selectedCommunityFilter !== "all") {
      result = result.filter((friend) =>
        friend.communities?.some((c) => c.id === selectedCommunityFilter)
      );
    }
    const keyword = search.trim().toLowerCase();
    if (keyword) {
      result = result.filter((friend) =>
        friend.displayName.toLowerCase().includes(keyword)
      );
    }
    return result;
  }, [friends, search, selectedCommunityFilter]);

  const toggleFavorite = async (friendId: string) => {
    if (!userId) return;
    const action = favoriteIds.has(friendId) ? "remove" : "add";
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, favoriteUserId: friendId, action }),
    });
    loadData(userId);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-4xl sm:px-6">
          <Link
            href="/"
            aria-label="フィードへ戻る"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
          >
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">フレンド</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 sm:max-w-4xl sm:px-6 sm:py-10">
        <section>
          <div className="mb-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="フレンドを検索"
              className="w-full rounded-full bg-white px-4 py-2 text-sm shadow-sm"
            />
          </div>

          {/* 所属コミュニティ絞り込み */}
          {communities.length > 0 && (
            <div className="mb-5">
              <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">所属で絞り込む</p>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedCommunityFilter("all")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCommunityFilter === "all"
                      ? "bg-[var(--accent)] text-white shadow-sm"
                      : "bg-white text-[var(--muted)] border border-orange-100 hover:bg-orange-50"
                  }`}
                >
                  オール
                </button>
                {communities.map((comm) => (
                  <button
                    key={comm.id}
                    type="button"
                    onClick={() => setSelectedCommunityFilter(comm.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCommunityFilter === comm.id
                        ? "bg-[var(--accent)] text-white shadow-sm"
                        : "bg-white text-[var(--muted)] border border-orange-100 hover:bg-orange-50"
                    }`}
                  >
                    <span className="material-symbols-rounded text-xs">groups</span>
                    {comm.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredFriends.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-orange-200 bg-white/80 p-8 text-center text-sm text-[var(--muted)]">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-[var(--accent)]">
                  <span className="material-symbols-rounded">group</span>
                </div>
                <p className="font-semibold text-[var(--foreground)]">
                  {friends.length === 0 ? "フレンドがまだいません。" : "一致するフレンドがいません。"}
                </p>
                <p className="mt-1 text-xs">招待リンクを共有して、まずは1人つながってみましょう。</p>
              </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {filteredFriends.map((friend) => (
                <li
                  key={friend.userId}
                  className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"
                >
                  <Link href={`/profile/${friend.userId}`} className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-3">
                      {(() => {
                        const avatar = friend.avatarIcon?.trim() ?? "";
                        const useImage = isImageAvatar(avatar);
                        const toneClass = getAvatarToneClass(friend.displayName.trim() || "user");

                        return (
                          <span
                            aria-hidden="true"
                            className={`grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-orange-100 text-base ${
                              useImage || avatar ? "bg-[#f7f4ef]/80" : toneClass
                            }`}
                          >
                            {useImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={avatar}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : avatar ? (
                              avatar
                            ) : (
                              <span className="material-symbols-rounded">person</span>
                            )}
                          </span>
                        );
                      })()}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                          {friend.displayName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{friend.area ?? "エリア未設定"}</p>
                        {friend.communities && friend.communities.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {friend.communities.map((c) => (
                              <span
                                key={c.id}
                                className="inline-flex items-center gap-0.5 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)] border border-orange-100"
                              >
                                {c.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => toggleFavorite(friend.userId)}
                    className={`grid h-9 w-9 place-items-center rounded-full ${
                      favoriteIds.has(friend.userId)
                        ? "bg-[var(--accent-3)] text-white"
                        : "bg-gray-100 text-gray-500"
                    }`}
                    aria-label={favoriteIds.has(friend.userId) ? "お気に入り解除" : "お気に入りに追加"}
                  >
                    <span className="material-symbols-rounded">
                      {favoriteIds.has(friend.userId) ? "star" : "star_border"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
