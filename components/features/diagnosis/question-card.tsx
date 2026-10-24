"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { DiagnosisQuestion } from "@/lib/community-diagnosis/questions";
import type { DiagnosisRating } from "@/lib/community-diagnosis/scoring";

type QuestionCardProps = {
  question: DiagnosisQuestion;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (rating: DiagnosisRating) => void;
};

// 端ほど大きく: [強くA, ややA, ややB, 強くB]
const CIRCLE_SIZES: [number, number, number, number] = [32, 22, 22, 32];
const RATINGS: DiagnosisRating[] = [1, 2, 3, 4];

export function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  onAnswer,
}: QuestionCardProps) {
  const [selected, setSelected] = useState<DiagnosisRating | null>(null);

  const handleSelect = (rating: DiagnosisRating) => {
    if (selected !== null) return;
    setSelected(rating);
    setTimeout(() => onAnswer(rating), 220);
  };

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm"
    >
      <p className="text-xs font-semibold text-[var(--accent)]">
        Q{questionNumber} / {totalQuestions}
      </p>
      <h2 className="mt-2 text-lg font-bold text-[var(--foreground)]">{question.text}</h2>

      <div className="mt-7">
        {/* ラベル行 */}
        <div className="flex items-start justify-between gap-3">
          <span className="w-[88px] shrink-0 text-center text-[11px] font-semibold leading-tight text-[var(--foreground)]">
            {question.optionA}
          </span>
          <span className="w-[88px] shrink-0 text-center text-[11px] font-semibold leading-tight text-[var(--foreground)]">
            {question.optionB}
          </span>
        </div>

        {/* 4つの円 */}
        <div className="mt-3 flex items-center justify-center gap-4">
          {RATINGS.map((rating) => {
            const size = CIRCLE_SIZES[rating - 1];
            const isSelected = selected === rating;
            return (
              <button
                key={rating}
                type="button"
                onClick={() => handleSelect(rating)}
                style={{ width: size, height: size }}
                className={`shrink-0 rounded-full border-2 transition-all duration-150 active:scale-90 ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent)] scale-110"
                    : "border-gray-300 bg-white hover:border-[var(--accent)]"
                }`}
              />
            );
          })}
        </div>

        {/* 目盛りラベル */}
        <div className="mt-2.5 flex justify-between px-1 text-[10px] text-[var(--muted)]">
          <span>←こちらに近い</span>
          <span>こちらに近い→</span>
        </div>
      </div>
    </motion.div>
  );
}
