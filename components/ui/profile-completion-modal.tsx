"use client";

import Link from "next/link";
import { useEffect } from "react";
import { hasAnyWeekdayAvailability } from "@/lib/availability";

export type Profile = {
  displayName?: string;
  avatarIcon?: string | null;
  birthDate?: string | null;
  playFrequency?: string | null;
  drinkFrequency?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  ngFoods?: string[];
  favoriteAreas?: string[];
  favoritePlaces?: string[];
  availability?: unknown;
  stats?: { completionRate?: number };
};

type Props = {
  visible: boolean;
  profile: Profile;
  onClose: () => void;
};

// use shared utility for availability detection
// (handles legacy `days` shape as well)

export function ProfileCompletionModal({ visible, profile, onClose }: Props) {
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const missing: string[] = [];

  if (!profile.displayName || profile.displayName.trim().length === 0) {
    missing.push("表示名（ニックネーム）");
  }

  if (!profile.birthDate) missing.push("生年月日");
  if (!profile.playFrequency) missing.push("遊ぶ頻度");
  if (!profile.drinkFrequency) missing.push("飲酒頻度");
  if (profile.budgetMin == null && profile.budgetMax == null) missing.push("予算レンジ");
  if (!profile.ngFoods || profile.ngFoods.length === 0) missing.push("苦手な食べ物");
  if (!profile.favoriteAreas || profile.favoriteAreas.length === 0) missing.push("よく行くエリア");
  if (!profile.favoritePlaces || profile.favoritePlaces.length === 0) missing.push("好きなお店ジャンル");
  if (!hasAnyWeekdayAvailability(profile.availability)) missing.push("普段の空き時間（曜日/時間帯）");

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-completion-title"
        className="relative mx-4 mb-6 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 id="profile-completion-title" className="mb-2 text-lg font-bold">プロフィールを完了してください</h3>
        <p className="mb-3 text-sm text-[var(--muted)]">プロフィールを完了させることでイベントが作成できるようになります。</p>

        {missing.length === 0 ? (
          <p className="mb-4 text-sm">もう少しで完了です。プロフィール編集ページで確認してください。</p>
        ) : (
          <div className="mb-4">
            <p className="mb-2 text-sm font-semibold">補足が必要な情報</p>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Link
            href="/profile/setup"
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            onClick={onClose}
          >
            プロフィールを編集する
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
