import assert from "node:assert/strict";
import { shouldAutoApprove, requiresApprovalByVisibility } from "../lib/event-approval";

// ── 1. 公開設定の判定 & 共存テスト ──
{
  const baseEvent = {
    scheduleMode: "candidate" as const,
    status: "open" as const,
    fixedStartTime: null,
    timeCandidates: [] as Array<{ startTime: Date }>,
    capacity: 10,
  };

  // public
  assert.equal(
    shouldAutoApprove({ ...baseEvent, visibility: "public" }, false, 0),
    true,
    "public イベントは自動承認される"
  );
  assert.equal(
    requiresApprovalByVisibility({ ...baseEvent, visibility: "public" }, false),
    false,
    "public イベントは承認不要"
  );

  // private
  assert.equal(
    shouldAutoApprove({ ...baseEvent, visibility: "private" }, false, 0),
    false,
    "private かつ未招待は自動承認されない"
  );
  assert.equal(
    requiresApprovalByVisibility({ ...baseEvent, visibility: "private" }, false),
    true,
    "private かつ未招待は承認が必要"
  );
  assert.equal(
    shouldAutoApprove({ ...baseEvent, visibility: "private" }, true, 0),
    true,
    "private でもオーナー招待なら自動承認される"
  );

  // limited
  assert.equal(
    shouldAutoApprove({ ...baseEvent, visibility: "limited" }, false, 0),
    true,
    "limited イベントは自動承認される"
  );

  // community
  assert.equal(
    shouldAutoApprove({ ...baseEvent, visibility: "community" }, false, 0),
    true,
    "community イベントは定員内なら自動承認される"
  );
  assert.equal(
    requiresApprovalByVisibility({ ...baseEvent, visibility: "community" }, false),
    false,
    "community イベントは visibility による承認保留にならない"
  );

  console.log("[PASS] community visibility coexists with public/limited/private approval rules");
}

// ── 2. コミュニティイベントのフィード・閲覧可否判定ロジック ──
{
  type EventForVisibilityCheck = {
    visibility: "public" | "limited" | "private" | "community";
    ownerId: string;
    communityId?: string | null;
    participants: Array<{ userId: string }>;
    invites: Array<{ inviteeId: string }>;
  };

  const canViewEvent = (
    event: EventForVisibilityCheck,
    viewerId: string | null,
    viewerCommunityIds: Set<string>
  ): boolean => {
    if (!viewerId) {
      return event.visibility === "public";
    }
    const isOwner = event.ownerId === viewerId;
    const isParticipant = event.participants.some((p) => p.userId === viewerId);
    const isInvited = event.invites.some((i) => i.inviteeId === viewerId);
    const isCommunityMember =
      event.visibility === "community" &&
      Boolean(event.communityId && viewerCommunityIds.has(event.communityId));

    return (
      event.visibility === "public" ||
      isOwner ||
      isParticipant ||
      isInvited ||
      isCommunityMember
    );
  };

  const communityEvent: EventForVisibilityCheck = {
    visibility: "community",
    ownerId: "user-owner",
    communityId: "comm-1",
    participants: [{ userId: "user-part" }],
    invites: [{ inviteeId: "user-inv" }],
  };

  // 未ログイン
  assert.equal(canViewEvent(communityEvent, null, new Set()), false, "未ログインはコミュニティイベント不可");

  // オーナー
  assert.equal(canViewEvent(communityEvent, "user-owner", new Set()), true, "オーナーは閲覧可能");

  // コミュニティメンバー
  assert.equal(canViewEvent(communityEvent, "user-member", new Set(["comm-1"])), true, "コミュニティメンバーは閲覧可能");

  // 別コミュニティ所属の部外者
  assert.equal(canViewEvent(communityEvent, "user-other", new Set(["comm-2"])), false, "別コミュニティメンバーは閲覧不可");

  // 招待された部外者
  assert.equal(canViewEvent(communityEvent, "user-inv", new Set()), true, "招待者はコミュニティ外でも閲覧可能");

  console.log("[PASS] community event visibility filtering works correctly");
}

// ── 3. フレンド検索のコミュニティ絞り込みロジック ──
{
  type FriendWithCommunities = {
    userId: string;
    displayName: string;
    communities?: Array<{ id: string; name: string }>;
  };

  const filterFriendsByCommunity = (
    friends: FriendWithCommunities[],
    communityFilter: string
  ): FriendWithCommunities[] => {
    if (communityFilter === "all") {
      return friends;
    }
    return friends.filter((friend) =>
      friend.communities?.some((c) => c.id === communityFilter)
    );
  };

  const sampleFriends: FriendWithCommunities[] = [
    {
      userId: "u1",
      displayName: "Alice",
      communities: [{ id: "c1", name: "Boardgame" }],
    },
    {
      userId: "u2",
      displayName: "Bob",
      communities: [{ id: "c2", name: "Music" }],
    },
    {
      userId: "u3",
      displayName: "Charlie",
      communities: [
        { id: "c1", name: "Boardgame" },
        { id: "c2", name: "Music" },
      ],
    },
    {
      userId: "u4",
      displayName: "David",
      communities: [],
    },
  ];

  // オール
  const allFiltered = filterFriendsByCommunity(sampleFriends, "all");
  assert.equal(allFiltered.length, 4, "オール指定時は全フレンドが返る");

  // c1 (Boardgame)
  const c1Filtered = filterFriendsByCommunity(sampleFriends, "c1");
  assert.equal(c1Filtered.length, 2, "c1所属の2名が返る");
  assert.deepEqual(
    c1Filtered.map((f) => f.userId),
    ["u1", "u3"],
    "AliceとCharlieが該当"
  );

  // c2 (Music)
  const c2Filtered = filterFriendsByCommunity(sampleFriends, "c2");
  assert.equal(c2Filtered.length, 2, "c2所属の2名が返る");
  assert.deepEqual(
    c2Filtered.map((f) => f.userId),
    ["u2", "u3"],
    "BobとCharlieが該当"
  );

  // 存在しないコミュニティ
  const emptyFiltered = filterFriendsByCommunity(sampleFriends, "c999");
  assert.equal(emptyFiltered.length, 0, "該当者がいなければ空配列");

  console.log("[PASS] friends list community filtering works correctly");
}

// ── 4. コミュニティ自動参加（重複防止）ロジック ──
{
  const addCommunityMember = (
    existingMembers: Set<string>,
    communityId: string,
    userId: string
  ): { added: boolean; newCount: number } => {
    const key = `${communityId}:${userId}`;
    if (existingMembers.has(key)) {
      return { added: false, newCount: existingMembers.size };
    }
    existingMembers.add(key);
    return { added: true, newCount: existingMembers.size };
  };

  const members = new Set<string>();
  const res1 = addCommunityMember(members, "comm-1", "user-1");
  assert.equal(res1.added, true, "初参加時はコミュニティに追加される");
  assert.equal(res1.newCount, 1);

  const res2 = addCommunityMember(members, "comm-1", "user-1");
  assert.equal(res2.added, false, "既に参加済みの場合は重複しない");
  assert.equal(res2.newCount, 1);

  const res3 = addCommunityMember(members, "comm-1", "user-2");
  assert.equal(res3.added, true, "別ユーザーは追加される");
  assert.equal(res3.newCount, 2);

  console.log("[PASS] community auto-membership addition handles duplicate correctly");
}

console.log("All community feature tests passed.");
