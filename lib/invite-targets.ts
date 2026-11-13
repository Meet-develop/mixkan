type ParticipantLike = { userId: string; status: string };
type InviteLike = { inviteeId: string | null; status: string };

/** 現在も参加中・申請中の参加者（辞退・離脱・非承認は含めない）。 */
export const getActiveParticipantIds = (participants: ParticipantLike[]) =>
  new Set(
    participants
      .filter((p) => p.status !== "declined" && p.status !== "cancelled")
      .map((p) => p.userId)
  );

/**
 * 重複招待の防止対象は未回答（pending）の招待のみ。
 * accepted の招待は参加者側（getActiveParticipantIds）で判定するため、
 * 離脱・非承認後の再招待を妨げないようにここでは含めない。
 */
export const getPendingInviteeIds = (invites: InviteLike[]) =>
  new Set(
    invites
      .filter((i) => i.status === "pending")
      .map((i) => i.inviteeId)
      .filter((v): v is string => Boolean(v))
  );

export const resolveInviteTargets = (
  friendIds: string[],
  participants: ParticipantLike[],
  invites: InviteLike[]
) => {
  const participantIds = getActiveParticipantIds(participants);
  const inviteeIds = getPendingInviteeIds(invites);
  const targetIds = friendIds.filter((id) => !participantIds.has(id) && !inviteeIds.has(id));
  const skipped = {
    alreadyParticipating: friendIds.filter((id) => participantIds.has(id)).length,
    alreadyInvited: friendIds.filter((id) => !participantIds.has(id) && inviteeIds.has(id)).length,
  };
  return { targetIds, skipped };
};
