"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AvatarName } from "@/components/ui/avatar-name";
import { EventConfirmModal } from "@/components/ui/event-confirm-modal";
import { formatEventStartLabel } from "@/lib/datetime";

type EventDetail = {
  id: string;
  purpose: string;
  area?: string | null;
  status: "open" | "confirmed" | "completed" | "cancelled";
  fixedStartTime?: string | null;
  fixedPlaceId?: string | null;
  fixedPlaceName?: string | null;
  owner: { userId: string; displayName: string; avatarIcon?: string | null };
  participants: {
    userId: string;
    displayName: string;
    avatarIcon?: string | null;
    status: string;
    role: string;
    invitedBy?: { userId: string; displayName: string; avatarIcon?: string | null } | null;
  }[];
  inviteRequests: {
    id: string;
    requester: {
      userId: string;
      displayName: string;
      avatarIcon?: string | null;
    };
    invitee: {
      userId: string;
      displayName: string;
      avatarIcon?: string | null;
    };
    createdAt: string;
  }[];
  timeCandidates: { id: string; startTime: string; endTime: string; score: number }[];
  placeCandidates: { id: string; placeId: string; name: string; address: string; score: number }[];
};

const formatStart = (start: string) => {
  return formatEventStartLabel(start);
};

export default function EventManagePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [timeCandidateId, setTimeCandidateId] = useState<string | null>(null);
  const [placeCandidateId, setPlaceCandidateId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const applyEventState = (data: EventDetail) => {
    setEvent(data);

    const matchedTimeCandidate = data.fixedStartTime
      ? data.timeCandidates.find(
          (candidate) =>
            new Date(candidate.startTime).getTime() ===
            new Date(data.fixedStartTime as string).getTime()
        )
      : null;
    setTimeCandidateId(matchedTimeCandidate?.id ?? data.timeCandidates[0]?.id ?? null);

    const matchedPlaceCandidate = data.fixedPlaceId
      ? data.placeCandidates.find((candidate) => candidate.placeId === data.fixedPlaceId)
      : data.fixedPlaceName
        ? data.placeCandidates.find((candidate) => candidate.name === data.fixedPlaceName)
        : null;
    setPlaceCandidateId(matchedPlaceCandidate?.id ?? data.placeCandidates[0]?.id ?? null);
  };

  const refreshEvent = async () => {
    const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as EventDetail;
    applyEventState(data);
  };

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getSession();
      setOwnerId(data.session?.user?.id ?? null);
    };

    loadUser();
  }, []);

  useEffect(() => {
    let active = true;

    const loadEvent = async () => {
      const response = await fetch(`/api/events/${eventId}`, { cache: "no-store" });
      if (!response.ok || !active) return;
      const data = (await response.json()) as EventDetail;
      applyEventState(data);
    };

    loadEvent();

    return () => {
      active = false;
    };
  }, [eventId]);

  const pendingParticipants = useMemo(
    () => event?.participants.filter((participant) => participant.status === "requested") ?? [],
    [event]
  );

  const requestCards = useMemo(() => {
    if (!event) return [];

    const participantCards = pendingParticipants.map((participant) => ({
      key: `join-${participant.userId}`,
      type: "join" as const,
      displayName: participant.displayName,
      avatarIcon: participant.avatarIcon,
      hint: participant.invitedBy
        ? `${participant.invitedBy.displayName}さんからの招待`
        : "参加リクエスト",
      userId: participant.userId,
    }));

    const inviteCards = (event.inviteRequests ?? []).map((request) => ({
      key: `invite-${request.id}`,
      type: "invite" as const,
      displayName: request.invitee.displayName,
      avatarIcon: request.invitee.avatarIcon,
      hint: `${request.requester.displayName}さんからの招待`,
      requesterId: request.requester.userId,
      inviteeId: request.invitee.userId,
    }));

    return [...participantCards, ...inviteCards];
  }, [event, pendingParticipants]);

  const requiresTimeSelection =
    !event?.fixedStartTime && (event?.timeCandidates.length ?? 0) > 0;
  const requiresPlaceSelection = (event?.placeCandidates.length ?? 0) > 0;

  const handleApprove = async (userId: string) => {
    if (!ownerId) return;
    await fetch(`/api/events/${eventId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId, userId }),
    });
    refreshEvent();
  };

  const handleDecline = async (userId: string) => {
    if (!ownerId) return;
    await fetch(`/api/events/${eventId}/decline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId, userId }),
    });
    refreshEvent();
  };

  const handleInviteRequestDecision = async (
    requesterId: string,
    inviteeId: string,
    decision: "approve" | "decline"
  ) => {
    if (!ownerId) return;

    await fetch(`/api/events/${eventId}/invite-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId, requesterId, inviteeId, decision }),
    });

    refreshEvent();
  };

  const handleExecuteConfirm = async () => {
    if (!ownerId) return;
    setIsConfirming(true);
    try {
      await fetch(`/api/events/${eventId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, timeCandidateId, placeCandidateId }),
      });
      await refreshEvent();
    } finally {
      setIsConfirming(false);
      setShowConfirmModal(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!ownerId || !event) return;
    if (event.owner.userId !== ownerId) return;

    const confirmed = window.confirm("このイベントを削除します。よろしいですか？");
    if (!confirmed) return;

    setDeleteError(null);
    setIsDeleting(true);

    const response = await fetch(`/api/events/${eventId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId }),
    });

    setIsDeleting(false);

    if (!response.ok) {
      setDeleteError("イベントの削除に失敗しました。時間をおいて再度お試しください。");
      return;
    }

    router.replace("/");
  };

  if (!event) {
    return (
      <div className="min-h-screen px-6 py-20 text-center text-sm text-[var(--muted)]">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl shadow-sm">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-5xl sm:px-6">
          <Link
            href={`/events/${event.id}`}
            aria-label="イベント詳細へ戻る"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
          >
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">イベント管理</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8 sm:max-w-5xl sm:px-6 sm:py-10">
        {ownerId && event.owner.userId !== ownerId && (
          <div className="mb-6 rounded-3xl bg-white/80 p-4 text-sm text-[var(--muted)] shadow-sm">
            このページはオーナー専用です。
          </div>
        )}
        <div className="mb-6 rounded-2xl bg-orange-50 px-4 py-3 text-sm text-[var(--muted)]">
          <span className="font-semibold text-[var(--accent)]">エリア:</span> {event.area ?? "未設定"}
        </div>
        <section>
          <h2 className="text-lg font-semibold">招待・参加リクエスト</h2>
          {requestCards.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">承認待ちはありません。</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {requestCards.map((card) => (
                <li key={card.key} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <AvatarName displayName={card.displayName} avatarIcon={card.avatarIcon} />
                      <p className="mt-2 text-xs text-[var(--muted)]">{card.hint}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() =>
                          card.type === "join"
                            ? handleApprove(card.userId)
                            : handleInviteRequestDecision(
                                card.requesterId,
                                card.inviteeId,
                                "approve"
                              )
                        }
                        className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 text-emerald-700"
                        aria-label="承認"
                      >
                        <span className="material-symbols-rounded text-base">check</span>
                      </button>
                      <button
                        onClick={() =>
                          card.type === "join"
                            ? handleDecline(card.userId)
                            : handleInviteRequestDecision(
                                card.requesterId,
                                card.inviteeId,
                                "decline"
                              )
                        }
                        className="grid h-9 w-9 place-items-center rounded-full bg-rose-100 text-rose-700"
                        aria-label="非承認"
                      >
                        <span className="material-symbols-rounded text-base">close</span>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 grid gap-6 pt-6 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">日程候補</h2>
            {event.fixedStartTime && (
              <div className="mt-3 rounded-2xl bg-orange-50 p-3 text-xs text-[var(--muted)]">
                現在の確定: {formatStart(event.fixedStartTime)}
              </div>
            )}
            {!requiresTimeSelection ? (
              <p className="mt-4 text-sm text-[var(--muted)]">日程候補はありません。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {event.timeCandidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className={`rounded-2xl p-4 text-sm shadow-sm ${
                      timeCandidateId === candidate.id
                        ? "bg-orange-50"
                        : "bg-white"
                    }`}
                  >
                    <p className="font-semibold text-[var(--foreground)]">
                      {formatStart(candidate.startTime)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">スコア: {candidate.score}</p>
                    <button
                      onClick={() => setTimeCandidateId(candidate.id)}
                      className="mt-2 w-full rounded-full bg-white px-3 py-2 text-xs shadow-sm"
                    >
                      選択
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold">お店候補</h2>
            {event.fixedPlaceName && (
              <div className="mt-3 rounded-2xl bg-orange-50 p-3 text-xs text-[var(--muted)]">
                現在の確定: {event.fixedPlaceName}
              </div>
            )}
            {event.placeCandidates.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--muted)]">お店候補はありません。</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {[...event.placeCandidates].sort((a, b) => b.score - a.score).map((candidate) => (
                  <li
                    key={candidate.id}
                    className={`rounded-2xl p-4 text-sm shadow-sm ${
                      placeCandidateId === candidate.id
                        ? "bg-orange-50"
                        : "bg-white"
                    }`}
                  >
                    <p className="font-semibold text-[var(--foreground)]">{candidate.name}</p>
                    <p className="text-xs text-[var(--muted)]">{candidate.address}</p>
                    <p className="text-xs text-[var(--muted)]">スコア: {candidate.score}</p>
                    <button
                      onClick={() => setPlaceCandidateId(candidate.id)}
                      className="mt-2 w-full rounded-full bg-white px-3 py-2 text-xs shadow-sm"
                    >
                      選択
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="mt-8">
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={
              !ownerId ||
              event.owner.userId !== ownerId ||
              (requiresTimeSelection && !timeCandidateId) ||
              (requiresPlaceSelection && !placeCandidateId)
            }
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="material-symbols-rounded">verified</span>
            {event.status === "confirmed" ? "確定情報を更新" : "最終確定"}
          </button>
          <Link
            href={`/events/new?editEventId=${event.id}`}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white px-6 py-3 text-sm font-semibold text-[var(--foreground)]"
          >
            <span className="material-symbols-rounded">edit</span>
            編集する
          </Link>
        </div>

        <section className="mt-8 pt-6">
          <h2 className="text-lg font-semibold">イベント削除</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            イベントを削除すると、参加予定メンバーに通知され、イベント情報は復元できません。
          </p>
          {deleteError && <p className="mt-2 text-xs font-semibold text-rose-700">{deleteError}</p>}
          <button
            onClick={handleDeleteEvent}
            disabled={
              isDeleting ||
              !ownerId ||
              event.owner.userId !== ownerId
            }
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-rose-300 px-6 py-3 text-sm font-semibold text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="material-symbols-rounded">delete</span>
            {isDeleting ? "削除中..." : "イベントを削除"}
          </button>
        </section>
      </main>

      <EventConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleExecuteConfirm}
        isConfirming={isConfirming}
      />
    </div>
  );
}
