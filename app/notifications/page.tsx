"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { notificationTypeIcon } from "@/lib/notification-content";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  eventId?: string | null;
  createdAt: string;
  readAt?: string | null;
  actionHref?: string;
  actionLabel?: string;
};

const periodOptions = [
  { value: "all", label: "すべて" },
  { value: "7d", label: "7日" },
  { value: "30d", label: "30日" },
  { value: "90d", label: "90日" },
] as const;

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [period, setPeriod] = useState<(typeof periodOptions)[number]["value"]>("30d");

  const loadNotifications = async (currentUserId: string, selectedPeriod: string) => {
    const response = await fetch(
      `/api/notifications?userId=${currentUserId}&period=${selectedPeriod}`
    );
    if (!response.ok) return;
    const data = (await response.json()) as Notification[];
    setNotifications(data);
  };

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUserId = data.session?.user?.id ?? null;
      if (currentUserId) {
        loadNotifications(currentUserId, period);
      }
    };

    loadUser();
  }, [period]);

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
          <h1 className="text-lg font-semibold">通知</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 sm:max-w-4xl sm:px-6 sm:py-10">
        <section>
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

          {notifications.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-orange-200 bg-white/80 p-8 text-center text-sm text-[var(--muted)]">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-[var(--accent)]">
                <span className="material-symbols-rounded">notifications</span>
              </div>
              <p className="font-semibold text-[var(--foreground)]">通知はまだありません。</p>
              <p className="mt-1 text-xs">イベントの招待や更新が届くとここに表示されます。</p>
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={`/notifications/${notification.id}`}
                    className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-100 text-[var(--accent)]">
                      <span className="material-symbols-rounded">
                        {notificationTypeIcon[notification.type] ?? "notifications"}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                          {notification.title}
                        </p>
                        {!notification.readAt && (
                          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-label="未読" />
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">
                        {notification.body}
                      </p>
                      <p className="mt-2 text-[11px] text-[var(--muted)]">
                        {new Date(notification.createdAt).toLocaleString("ja-JP")}
                      </p>
                    </div>
                    <span className="material-symbols-rounded text-[var(--muted)]">chevron_right</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
