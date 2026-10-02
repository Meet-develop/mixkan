import assert from "node:assert/strict";
import { shouldAutoApprove, requiresApprovalByVisibility } from "../lib/event-approval";

const baseEvent = {
  scheduleMode: "candidate" as const,
  status: "open" as const,
  fixedStartTime: null,
  timeCandidates: [] as Array<{ startTime: Date }> ,
  capacity: 10,
};

{
  const ev = { ...baseEvent, visibility: "private" };
  const auto = shouldAutoApprove(ev, false, 0);
  assert.equal(auto, false, "private イベントかつ招待なしでは自動承認されない");
  assert.equal(requiresApprovalByVisibility(ev, false), true, "private かつ未招待は承認が必要");
  console.log("[PASS] private visibility requires approval when not invited");
}

{
  const ev = { ...baseEvent, visibility: "public" };
  const auto = shouldAutoApprove(ev, false, 0);
  assert.equal(auto, true, "public イベントでは自動承認される");
  console.log("[PASS] public visibility auto-approves");
}

{
  const ev = { ...baseEvent, visibility: "private" };
  const auto = shouldAutoApprove(ev, true, 0);
  assert.equal(auto, true, "オーナー招待なら private でも自動承認される");
  console.log("[PASS] invited by owner bypasses private approval");
}

console.log("All event approval tests passed.");
