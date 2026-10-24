"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  COMMUNITY_AXES,
  getCommunityType,
  type AxisKey,
  type CommunityTypeDef,
} from "@/lib/community-diagnosis/types";

type ResultCardProps = {
  type: CommunityTypeDef;
  axisScores: Record<AxisKey, number>;
};

// イラスト差し替えスロット。画像が未配置の間はテーマカラーのフォールバックを表示する
function TypeIllustration({ type }: { type: CommunityTypeDef }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div
      className="relative grid h-36 w-36 place-items-center overflow-hidden rounded-3xl shadow-inner"
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
        <span className="text-3xl font-black tracking-widest text-white/90">
          {type.code}
        </span>
      )}
    </div>
  );
}

function AxisBar({ axisKey, score }: { axisKey: AxisKey; score: number }) {
  const axis = COMMUNITY_AXES.find((item) => item.key === axisKey);
  if (!axis) return null;

  const isPoleA = score > 0.5;
  return (
    <div className="rounded-2xl bg-orange-50/70 px-3 py-2">
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
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score * 100}%`, backgroundColor: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

export function ResultCard({ type, axisScores }: ResultCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-md"
    >
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

      <div className="space-y-2 px-6">
        {COMMUNITY_AXES.map((axis) => (
          <AxisBar key={axis.key} axisKey={axis.key} score={axisScores[axis.key] ?? 0} />
        ))}
      </div>

      <div className="px-6 py-5">
        <h3 className="text-xs font-bold text-[var(--muted)]">相性のいいタイプ</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {type.goodMatchTypes.map((matchCode) => {
            const match = getCommunityType(matchCode);
            if (!match) return null;
            return (
              <span
                key={matchCode}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm"
                style={{ border: `1px solid ${match.themeColor}55`, color: match.themeColor }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: match.themeColor }}
                />
                {match.name}
              </span>
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
    </motion.div>
  );
}
