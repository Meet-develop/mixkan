export type TimeCandidate = { startTime: Date };

export type ApprovalEvent = {
  scheduleMode: "fixed" | "candidate";
  status: "open" | "confirmed" | "completed" | "cancelled";
  fixedStartTime: Date | null;
  timeCandidates: TimeCandidate[];
  visibility?: string | null;
  capacity?: number | null;
};

export const needsOwnerApprovalByDeadline = (event: ApprovalEvent) => {
  const now = Date.now();

  if (event.status === "cancelled") {
    return true;
  }

  if (event.scheduleMode === "fixed") {
    if (!event.fixedStartTime) {
      return false;
    }
    const deadline = new Date(event.fixedStartTime);
    deadline.setDate(deadline.getDate() - 1);
    return now > deadline.getTime();
  }

  if (event.status !== "open") {
    return true;
  }

  const candidateStarts = event.timeCandidates
    .map((candidate) => candidate.startTime.getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  const firstStart =
    event.fixedStartTime != null
      ? event.fixedStartTime.getTime()
      : candidateStarts.length > 0
      ? Math.min(...candidateStarts)
      : now + 7 * 24 * 60 * 60 * 1000;

  const deadline = new Date(firstStart);
  deadline.setDate(deadline.getDate() - 1);
  return now > deadline.getTime();
};

export const shouldAutoApprove = (
  event: ApprovalEvent,
  isInvitedByOwner: boolean,
  approvedCount: number
) => {
  const overCapacity = (event.capacity ?? Infinity) <= approvedCount;
  const requiresApprovalByDeadline = needsOwnerApprovalByDeadline(event);
  const requiresApprovalByVisibility = event.visibility === "private" && !isInvitedByOwner;

  return !overCapacity && !requiresApprovalByDeadline && !requiresApprovalByVisibility;
};

export const requiresApprovalByVisibility = (event: ApprovalEvent, isInvitedByOwner: boolean) =>
  event.visibility === "private" && !isInvitedByOwner;
