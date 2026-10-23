"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { AvatarName } from "@/components/ui/avatar-name";
import { formatEventStartLabel } from "@/lib/datetime";

type EventSummary = {
  id: string;
  purpose: string;
  status: string;
  fixedStartTime?: string | null;
  startTime?: string | null;
  timeCandidates: { id: string; startTime: string; endTime: string; score: number }[];
  owner: { userId: string; displayName: string; avatarIcon?: string | null };
  createdAt: string;
};

type HistoryResponse = {
  history: EventSummary[];
};

const periodOptions = [
  { value: "all", label: "すべて" },
  { value: "7d", label: "7日" },
  { value: "30d", label: "30日" },
  { value: "90d", label: "90日" },
] as const;

const formatStart = (start?: string | null) => {
  if (!start) return "候補から決定";
  return formatEventStartLabel(start);
};

export default function EventHistoryPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<EventSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [period, setPeriod] = useState<(typeof periodOptions)[number]["value"]>("30d");

  useEffect(() => {
    let active = true;

    const syncUser = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
    };

    syncUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    const loadHistory = async () => {
      setIsLoading(true);
      const response = await fetch(
        `/api/events?viewerId=${encodeURIComponent(userId)}&includePast=1&period=${period}`,
        { cache: "no-store" }
      );
      if (!response.ok || !active) {
        setIsLoading(false);
        return;
      }

      const data = (await response.json()) as HistoryResponse;
      if (!active) return;
      const completedEvents = (data.history ?? []).filter((event) => event.status === "completed");
      setHistory(completedEvents);
      setIsLoading(false);
    };

    loadHistory();

    return () => {
      active = false;
    };
  }, [period, userId]);

  const sortedHistory = useMemo(
    () =>
      [...history].sort(
        (a, b) =>
          new Date(b.startTime ?? b.createdAt).getTime() -
          new Date(a.startTime ?? a.createdAt).getTime()
      ),
    [history]
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-5xl sm:px-6">
          <Link
            href="/"
            aria-label="フィードへ戻る"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
          >
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">参加履歴</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 sm:max-w-5xl sm:px-6 sm:py-10">
        <div className="mb-4 flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value)}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                period === option.value
                  ? "bg-[var(--accent)] text-white"
                  : "bg-white text-[var(--muted)] shadow-sm"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-orange-100 bg-white/85 p-8 text-center text-sm text-[var(--muted)] shadow-sm">
            読み込み中...
          </div>
        ) : sortedHistory.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-orange-200 bg-white/80 p-8 text-center text-sm text-[var(--muted)]">
            参加履歴はまだありません。
          </div>
        ) : (
          <div className="space-y-3">
            {sortedHistory.map((event) => (
              <HistoryEventListItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function HistoryEventListItem({ event }: { event: EventSummary }) {
  const primaryTime = event.fixedStartTime
    ? formatStart(event.fixedStartTime)
    : event.timeCandidates[0]
      ? formatStart(event.timeCandidates[0].startTime)
      : formatStart(event.startTime);

  return (
    <Link
      href={`/events/${event.id}`}
      className="flex items-center gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"
    >
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-100 text-[var(--accent)]">
        <span className="material-symbols-rounded">event</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--foreground)]">{event.purpose}</p>
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
}
