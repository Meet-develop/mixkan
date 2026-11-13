import assert from "node:assert/strict";
import { resolveInviteTargets } from "../lib/invite-targets";

// 招待経由で参加後に離脱（invite は accepted のまま）→ 再招待できる
{
  const r = resolveInviteTargets(
    ["a"],
    [{ userId: "a", status: "cancelled" }],
    [{ inviteeId: "a", status: "accepted" }]
  );
  assert.deepEqual(r.targetIds, ["a"], "離脱後は accepted 招待が残っていても再招待できる");
  assert.deepEqual(r.skipped, { alreadyParticipating: 0, alreadyInvited: 0 });
}

// 非承認後も再招待できる
{
  const r = resolveInviteTargets(
    ["a"],
    [{ userId: "a", status: "declined" }],
    [{ inviteeId: "a", status: "accepted" }]
  );
  assert.deepEqual(r.targetIds, ["a"]);
}

// 参加中・申請中は除外
{
  const r = resolveInviteTargets(
    ["a", "b"],
    [
      { userId: "a", status: "approved" },
      { userId: "b", status: "requested" },
    ],
    [{ inviteeId: "a", status: "accepted" }]
  );
  assert.deepEqual(r.targetIds, []);
  assert.deepEqual(r.skipped, { alreadyParticipating: 2, alreadyInvited: 0 });
}

// 未回答（pending）の招待は重複送信しない
{
  const r = resolveInviteTargets(["a", "b"], [], [{ inviteeId: "a", status: "pending" }]);
  assert.deepEqual(r.targetIds, ["b"]);
  assert.deepEqual(r.skipped, { alreadyParticipating: 0, alreadyInvited: 1 });
}

// 招待が declined の場合は再招待できる
{
  const r = resolveInviteTargets(["a"], [], [{ inviteeId: "a", status: "declined" }]);
  assert.deepEqual(r.targetIds, ["a"]);
}

console.log("invite-targets tests passed");
