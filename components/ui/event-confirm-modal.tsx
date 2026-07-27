"use client";

import React from "react";

type EventConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isConfirming?: boolean;
};

export function EventConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isConfirming = false,
}: EventConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl transition-all scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600 mb-3">
            <span className="material-symbols-rounded text-2xl">error_outline</span>
          </div>

          <h3 id="confirm-modal-title" className="text-lg font-bold text-[var(--foreground)]">
            イベントの確定確認
          </h3>

          <div className="mt-4 space-y-3 rounded-2xl bg-amber-50/80 p-4 text-left text-xs text-amber-900 border border-amber-200/60">
            <div className="flex items-start gap-2">
              <span className="material-symbols-rounded text-base text-amber-600 shrink-0 mt-0.5">
                notifications_active
              </span>
              <p className="leading-relaxed">
                イベントを確定すると、全員に確定の通知がいきます。
              </p>
            </div>
            <div className="flex items-start gap-2 border-t border-amber-200/60 pt-2.5">
              <span className="material-symbols-rounded text-base text-amber-600 shrink-0 mt-0.5">
                storefront
              </span>
              <p className="leading-relaxed">
                お店開催の場合、予約はできましたか？まだの場合は、予約をしてから確定させてください。
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition disabled:opacity-50"
          >
            <span className="material-symbols-rounded text-lg">check_circle</span>
            {isConfirming ? "確定処理中..." : "確定する"}
          </button>
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-200 active:scale-[0.98] transition disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
