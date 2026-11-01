"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import {
  NOTIFICATION_CATEGORY_GROUPS,
  type NotificationCategory,
  type NotificationPreferencesResponse,
} from "@/lib/notification-categories";
import {
  disablePush,
  enablePush,
  getCurrentPushSubscription,
  isPushSupported,
  needsHomeScreenInstall,
} from "@/lib/push-client";

type PushState = "loading" | "unsupported" | "install_required" | "denied" | "off" | "on";

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-[var(--accent)]" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function NotificationSettingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationPreferencesResponse | null>(null);
  const [pushState, setPushState] = useState<PushState>("loading");
  const [isPushBusy, setIsPushBusy] = useState(false);
  const [savingCategory, setSavingCategory] = useState<NotificationCategory | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSettings = useCallback(async (currentUserId: string) => {
    const response = await fetch(
      `/api/notifications/preferences?userId=${encodeURIComponent(currentUserId)}`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      setErrorMessage("通知設定の取得に失敗しました。");
      return;
    }
    setSettings((await response.json()) as NotificationPreferencesResponse);
  }, []);

  const detectPushState = useCallback(async () => {
    if (needsHomeScreenInstall()) {
      setPushState("install_required");
      return;
    }
    if (!isPushSupported()) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    try {
      const subscription = await getCurrentPushSubscription();
      setPushState(subscription && Notification.permission === "granted" ? "on" : "off");
    } catch {
      setPushState("off");
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUserId = data.session?.user?.id ?? null;
      setUserId(currentUserId);
      if (currentUserId) {
        await loadSettings(currentUserId);
      }
      await detectPushState();
    };

    void init();
  }, [detectPushState, loadSettings]);

  const handlePushToggle = async (next: boolean) => {
    if (!userId) return;
    setIsPushBusy(true);
    setErrorMessage(null);

    try {
      if (next) {
        const result = await enablePush(userId);
        if (result === "denied") {
          setErrorMessage("通知が許可されませんでした。ブラウザまたは端末の設定から通知を許可してください。");
        } else if (result === "unsupported") {
          setErrorMessage("このブラウザは Push 通知に対応していません。");
        } else if (result === "not_configured") {
          setErrorMessage("Push 通知は現在準備中です。");
        }
      } else {
        await disablePush(userId);
      }
    } catch (error) {
      console.error("Failed to toggle push notifications", error);
      setErrorMessage("Push 通知の設定変更に失敗しました。時間をおいて再度お試しください。");
    } finally {
      await Promise.all([detectPushState(), loadSettings(userId)]);
      setIsPushBusy(false);
    }
  };

  const handleCategoryToggle = async (category: NotificationCategory, enabled: boolean) => {
    if (!userId || !settings) return;
    const previous = settings;
    setSavingCategory(category);
    setErrorMessage(null);
    setSettings({ ...settings, preferences: { ...settings.preferences, [category]: enabled } });

    const response = await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, preferences: { [category]: enabled } }),
    }).catch(() => null);

    if (!response?.ok) {
      setSettings(previous);
      setErrorMessage("設定の保存に失敗しました。");
    } else {
      setSettings((await response.json()) as NotificationPreferencesResponse);
    }
    setSavingCategory(null);
  };

  const pushDescription: Record<PushState, string> = {
    loading: "確認中…",
    unsupported: "このブラウザは Push 通知に対応していません。",
    install_required:
      "iPhone / iPad では、共有メニューから「ホーム画面に追加」したアプリから Push 通知を有効にできます。",
    denied: "通知がブロックされています。ブラウザまたは端末の設定から mixkan の通知を許可してください。",
    off: "この端末で Push 通知を受け取ります。",
    on: "この端末で Push 通知を受け取っています。",
  };

  const totalDeviceCount = settings?.pushSubscriptionCount ?? 0;
  const otherDeviceCount = Math.max(0, totalDeviceCount - (pushState === "on" ? 1 : 0));

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-4xl sm:px-6">
          <Link
            href="/notifications"
            aria-label="通知一覧へ戻る"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
          >
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">通知設定</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-8 px-4 py-8 sm:max-w-2xl sm:px-6 sm:py-10">
        {errorMessage && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
            {errorMessage}
          </p>
        )}

        <section>
          <h2 className="mb-3 text-xs font-semibold text-[var(--muted)]">受け取り方法</h2>
          <div className="divide-y divide-orange-50 rounded-2xl border border-orange-100 bg-white shadow-sm">
            <div className="flex items-center gap-3 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange-100 text-[var(--accent)]">
                <span className="material-symbols-rounded">notifications_active</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Push 通知</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{pushDescription[pushState]}</p>
                {otherDeviceCount > 0 && (
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    ほかに {otherDeviceCount} 台の端末で有効です
                  </p>
                )}
              </div>
              <Toggle
                label="Push 通知"
                checked={pushState === "on"}
                disabled={!userId || isPushBusy || (pushState !== "on" && pushState !== "off")}
                onChange={handlePushToggle}
              />
            </div>

            <div className="flex items-center gap-3 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-green-50 text-[#06c755]">
                <span className="material-symbols-rounded">chat</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">LINE 通知</p>
                  {settings?.lineLinked && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        settings.lineActive
                          ? "bg-green-50 text-[#06c755]"
                          : "bg-gray-100 text-[var(--muted)]"
                      }`}
                    >
                      {settings.lineActive ? "有効" : "停止中"}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {!settings
                    ? "確認中…"
                    : !settings.lineLinked
                      ? "LINE と連携すると、招待・開催確定などの大切なお知らせを LINE で受け取れます。"
                      : settings.lineActive
                        ? "招待・開催確定・中止のお知らせのみ LINE に届きます。"
                        : "Push 通知が有効なため LINE 通知は停止しています。Push 通知をすべての端末で無効にすると再開します。"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {NOTIFICATION_CATEGORY_GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="mb-3 text-xs font-semibold text-[var(--muted)]">{group.title}</h2>
            <ul className="divide-y divide-orange-50 rounded-2xl border border-orange-100 bg-white shadow-sm">
              {group.items.map((item) => (
                <li key={item.category} className="flex items-center gap-3 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange-100 text-[var(--accent)]">
                    <span className="material-symbols-rounded">{item.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-semibold">{item.label}</p>
                      {item.lineSupported && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-[#06c755]">
                          LINE対応
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{item.description}</p>
                  </div>
                  <Toggle
                    label={item.label}
                    checked={settings?.preferences[item.category] ?? true}
                    disabled={!settings || savingCategory === item.category}
                    onChange={(next) => handleCategoryToggle(item.category, next)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="text-[11px] leading-relaxed text-[var(--muted)]">
          OFF にしたカテゴリーは Push 通知・LINE 通知が届かなくなりますが、アプリ内の通知一覧には引き続き表示されます。
        </p>
      </main>
    </div>
  );
}
