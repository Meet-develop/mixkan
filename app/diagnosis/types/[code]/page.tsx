"use client";

import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommunityType, COMMUNITY_AXES, COMMUNITY_TYPES } from "@/lib/community-diagnosis/types";

function TypeIllustration({ type }: { type: ReturnType<typeof getCommunityType> & object }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div
      className="relative grid h-40 w-40 place-items-center overflow-hidden rounded-3xl shadow-inner"
      style={{
        background: `linear-gradient(135deg, ${type.themeColor}, ${type.themeColor}99)`,
      }}
    >
      {!imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={type.imagePath}
          alt={type.name}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-4xl font-black tracking-widest text-white/90">
          {type.code}
        </span>
      )}
    </div>
  );
}

export default function TypeDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const type = getCommunityType(code);
  if (!type) notFound();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-orange-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-4xl sm:px-6">
          <Link
            href="/profile/setup"
            aria-label="もどる"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
          >
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">タイプ詳細</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <div className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-md">
          {/* ヘッダー */}
          <div
            className="flex flex-col items-center px-6 pb-6 pt-8 text-center"
            style={{ background: `linear-gradient(180deg, ${type.themeColor}1f, transparent)` }}
          >
            <p className="text-xs font-bold tracking-[0.3em]" style={{ color: type.themeColor }}>
              {type.code}
            </p>
            <div className="mt-4">
              <TypeIllustration type={type} />
            </div>
            <h2 className="mt-5 text-xl font-black text-[var(--foreground)]">{type.name}</h2>
            <p className="mt-1 text-xs font-semibold" style={{ color: type.themeColor }}>
              {type.tagline}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]/80">
              {type.description}
            </p>
          </div>

          {/* 軸の傾向 */}
          <div className="space-y-2 px-6">
            {COMMUNITY_AXES.map((axis) => {
              const axisIndex = COMMUNITY_AXES.indexOf(axis);
              const letter = type.code[axisIndex];
              const isPoleA = letter === axis.poleA.letter;
              return (
                <div key={axis.key} className="rounded-2xl bg-orange-50/70 px-3 py-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className={isPoleA ? "text-[var(--accent)]" : "text-[var(--muted)]"}>
                      {axis.poleA.label}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">{axis.label}</span>
                    <span className={!isPoleA ? "text-[var(--accent)]" : "text-[var(--muted)]"}>
                      {axis.poleB.label}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: "rgba(142, 119, 96, 0.25)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: isPoleA ? "80%" : "20%",
                        backgroundColor: "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 相性・おすすめ */}
          <div className="px-6 py-5">
            <h3 className="text-xs font-bold text-[var(--muted)]">相性のいいタイプ</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {type.goodMatchTypes.map((matchCode) => {
                const match = getCommunityType(matchCode);
                if (!match) return null;
                return (
                  <Link
                    key={matchCode}
                    href={`/diagnosis/types/${matchCode.toLowerCase()}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm"
                    style={{ border: `1px solid ${match.themeColor}55`, color: match.themeColor }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: match.themeColor }}
                    />
                    {match.name}
                  </Link>
                );
              })}
            </div>

            <h3 className="mt-4 text-xs font-bold text-[var(--muted)]">相性のいいお店ジャンル</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {type.recommendedGenres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-[var(--accent)]"
                >
                  {genre}
                </span>
              ))}
            </div>

            <h3 className="mt-4 text-xs font-bold text-[var(--muted)]">おすすめの集まり方</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {type.recommendedEventStyles.map((style) => (
                <span
                  key={style}
                  className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-[var(--accent)]"
                >
                  {style}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 全16タイプ一覧 */}
        <div className="mt-8">
          <h3 className="mb-3 text-xs font-bold text-[var(--muted)]">全16タイプを見る</h3>
          <div className="flex flex-wrap gap-2">
            {COMMUNITY_TYPES.map((t) => (
              <Link
                key={t.code}
                href={`/diagnosis/types/${t.code.toLowerCase()}`}
                className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm transition ${
                  t.code === type.code ? "ring-2" : "opacity-70 hover:opacity-100"
                }`}
                style={{
                  border: `1px solid ${t.themeColor}55`,
                  color: t.themeColor,
                  ...(t.code === type.code ? { outline: `2px solid ${t.themeColor}` } : {}),
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.themeColor }} />
                {t.name}
              </Link>
            ))}
          </div>
        </div>

        <Link
          href="/diagnosis"
          className="mt-6 block w-full rounded-full bg-[var(--accent)] px-6 py-3.5 text-center text-sm font-bold text-white shadow-md"
        >
          診断してみる
        </Link>
      </main>
    </div>
  );
}
