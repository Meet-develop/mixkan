"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { AvatarName } from "@/components/ui/avatar-name";
import { consumeFeedRefreshNeeded } from "@/lib/feed-refresh";
import { formatEventStartLabel } from "@/lib/datetime";

type EventSummary = {
  id: string;
  purpose: string;
  visibility: "public" | "limited" | "private";
  capacity: number;
  status: "open" | "confirmed" | "completed" | "cancelled";
  scheduleMode: "fixed" | "candidate";
  fixedStartTime?: string | null;
  fixedEndTime?: string | null;
  fixedPlaceName?: string | null;
  owner: { userId: string; displayName: string; avatarIcon?: string | null };
  approvedCount: number;
  timeCandidates: { id: string; startTime: string; endTime: string; score: number }[];
  placeCandidates: { id: string; name: string; address: string; score: number }[];
  isFavoriteOwner: boolean;
  viewerRelation: "participating" | "invited" | "public";
  createdAt: string;
};

type FeedResponse = {
  participating: EventSummary[];
  invited: EventSummary[];
  public: EventSummary[];
};

const formatStart = (start?: string | null) => {
  if (!start) return "候補から決定";
  return formatEventStartLabel(start);
};

export default function HomePage() {
  const [feed, setFeed] = useState<FeedResponse>({
    participating: [],
    invited: [],
    public: [],
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [isSessionResolved, setIsSessionResolved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const latestFeedRequestRef = useRef(0);

  useEffect(() => {
    let active = true;

    const syncUser = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
      setIsSessionResolved(true);
    };

    syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id) {
        setUserId(session.user.id);
        setIsSessionResolved(true);
        return;
      }

      // Guard against transient null sessions on slower devices.
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
      setIsSessionResolved(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSessionResolved) {
      return;
    }

    const loadEvents = async () => {
      const requestId = latestFeedRequestRef.current + 1;
      latestFeedRequestRef.current = requestId;
      setIsLoading(true);
      const query = userId ? `?viewerId=${userId}` : "";
      consumeFeedRefreshNeeded();
      const requestInit = { cache: "no-store" as const };
      const response = await fetch(
        `/api/events${query}`,
        requestInit
      );
      if (requestId !== latestFeedRequestRef.current) {
        return;
      }
      const data = (await response.json()) as FeedResponse;
      setFeed(data);
      setIsLoading(false);
    };

    loadEvents();
  }, [isSessionResolved, userId]);

  const sortedParticipating = useMemo(
    () => [...feed.participating].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [feed.participating]
  );
  const sortedInvited = useMemo(
    () => [...feed.invited].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [feed.invited]
  );
  const sortedPublic = useMemo(
    () => [...feed.public].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [feed.public]
  );

  const sections = [
    {
      key: "participating",
      title: "参加予定のイベント",
      icon: "event_available",
      description: "あなたが参加する予定のイベント",
      events: sortedParticipating,
      emptyMessage: "参加予定のイベントはまだありません。",
    },
    {
      key: "invited",
      title: "招待されているイベント",
      icon: "mail",
      description: "返答待ちの招待イベント",
      events: sortedInvited,
      emptyMessage: "招待中のイベントはありません。",
    },
    {
      key: "public",
      title: "公開されているイベント",
      icon: "public",
      description: "誰でも参加できるイベント",
      events: sortedPublic,
      emptyMessage: "公開イベントはまだありません。",
    },
  ] as const;

  const visibleSections = userId
    ? sections
    : sections.filter((section) => section.key === "public");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-4 sm:max-w-6xl sm:px-6">
          <h1 className="text-lg font-semibold">イベントフィード</h1>
          {userId && (
            <Link
              href="/events/history"
              aria-label="参加履歴を見る"
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
            >
              <span className="material-symbols-rounded">history</span>
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 sm:max-w-6xl sm:px-6 sm:py-10">
        {visibleSections.map((section) => (
          <section key={section.key} className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--foreground)]">
                  <span className="material-symbols-rounded text-[var(--accent)]">{section.icon}</span>
                  {section.title}
                </h2>
                <p className="text-xs text-[var(--muted)]">{section.description}</p>
              </div>
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-600">
                {section.events.length}
              </span>
            </div>

            {isLoading ? (
              <div className="rounded-3xl border border-orange-100 bg-white/85 p-8 text-center text-sm text-[var(--muted)] shadow-sm">
                読み込み中...
              </div>
            ) : section.events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white/80 p-8 text-center text-sm text-[var(--muted)]">
                {section.emptyMessage}
              </div>
            ) : (
              <div className="space-y-3">
                {section.events.map((event) => (
                  <EventListItem key={event.id} event={event} />
                ))}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}

function EventListItem({ event }: { event: EventSummary }) {
  const primaryTime = event.fixedStartTime
    ? formatStart(event.fixedStartTime)
    : event.timeCandidates[0]
      ? formatStart(event.timeCandidates[0].startTime)
      : "候補から決定";

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card"
    >
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-100 text-[var(--accent)]">
        <span className="material-symbols-rounded">event</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--foreground)]">{event.purpose}</p>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <AvatarName displayName={event.owner.displayName} avatarIcon={event.owner.avatarIcon} className="max-w-[60%]" textClassName="truncate" />
          <span>・{primaryTime}</span>
        </div>
      </div>
      <span className="material-symbols-rounded text-[var(--accent)]">chevron_right</span>
    </Link>
  );
}
