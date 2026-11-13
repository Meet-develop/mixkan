import assert from "node:assert/strict";
import {
  DEFAULT_LINE_AVATAR_TTL_MS,
  LineApiError,
  getLineAvatarTtlMs,
  getLineApiRetryConfig,
  isLineHostedAvatar,
  isLineAvatarExpired,
  fetchWithRetry,
  refreshLineAvatarIfExpired,
  resetLineAvatarRefreshState,
  type ProfileAvatarDbClient,
} from "../lib/line-avatar";
import { prisma } from "../lib/prisma";
import { GET as getProfileById } from "../app/api/profiles/[id]/route";
import { POST as upsertProfile } from "../app/api/profiles/route";

// --- 1. getLineAvatarTtlMs tests ---
{
  const prevMs = process.env.LINE_AVATAR_TTL_MS;
  const prevSec = process.env.LINE_AVATAR_TTL_SECONDS;

  try {
    delete process.env.LINE_AVATAR_TTL_MS;
    delete process.env.LINE_AVATAR_TTL_SECONDS;
    assert.equal(getLineAvatarTtlMs(), DEFAULT_LINE_AVATAR_TTL_MS, "デフォルトで7日間が返る");

    process.env.LINE_AVATAR_TTL_MS = "86400000";
    assert.equal(getLineAvatarTtlMs(), 86400000, "LINE_AVATAR_TTL_MS が反映される");

    process.env.LINE_AVATAR_TTL_MS = "86400abc";
    assert.equal(
      getLineAvatarTtlMs(),
      DEFAULT_LINE_AVATAR_TTL_MS,
      "不正な数値文字列は無視されデフォルト値が返る"
    );

    delete process.env.LINE_AVATAR_TTL_MS;
    process.env.LINE_AVATAR_TTL_SECONDS = "3600";
    assert.equal(getLineAvatarTtlMs(), 3600000, "LINE_AVATAR_TTL_SECONDS がミリ秒換算されて反映される");
  } finally {
    if (prevMs !== undefined) process.env.LINE_AVATAR_TTL_MS = prevMs;
    else delete process.env.LINE_AVATAR_TTL_MS;
    if (prevSec !== undefined) process.env.LINE_AVATAR_TTL_SECONDS = prevSec;
    else delete process.env.LINE_AVATAR_TTL_SECONDS;
  }

  console.log("[PASS] getLineAvatarTtlMs configuration works");
}

// --- 2. getLineApiRetryConfig tests ---
{
  const prevRetries = process.env.LINE_API_MAX_RETRIES;
  const prevDelay = process.env.LINE_API_RETRY_DELAY_MS;

  try {
    delete process.env.LINE_API_MAX_RETRIES;
    delete process.env.LINE_API_RETRY_DELAY_MS;
    const defConfig = getLineApiRetryConfig();
    assert.equal(defConfig.maxRetries, 2, "デフォルトリトライ回数は2回");
    assert.equal(defConfig.retryDelayMs, 500, "デフォルトリトライ間隔は500ms");

    process.env.LINE_API_MAX_RETRIES = "3";
    process.env.LINE_API_RETRY_DELAY_MS = "800";
    const customConfig = getLineApiRetryConfig();
    assert.equal(customConfig.maxRetries, 3, "環境変数LINE_API_MAX_RETRIESが反映される");
    assert.equal(customConfig.retryDelayMs, 800, "環境変数LINE_API_RETRY_DELAY_MSが反映される");

    process.env.LINE_API_MAX_RETRIES = "3abc";
    process.env.LINE_API_RETRY_DELAY_MS = "-100";
    const fallbackConfig = getLineApiRetryConfig();
    assert.equal(fallbackConfig.maxRetries, 2, "不正なリトライ回数はデフォルトにフォールバック");
    assert.equal(fallbackConfig.retryDelayMs, 500, "負のリトライ間隔はデフォルトにフォールバック");
  } finally {
    if (prevRetries !== undefined) process.env.LINE_API_MAX_RETRIES = prevRetries;
    else delete process.env.LINE_API_MAX_RETRIES;
    if (prevDelay !== undefined) process.env.LINE_API_RETRY_DELAY_MS = prevDelay;
    else delete process.env.LINE_API_RETRY_DELAY_MS;
  }

  console.log("[PASS] getLineApiRetryConfig configuration works");
}

// --- 3. isLineHostedAvatar tests ---
{
  assert.equal(isLineHostedAvatar(null), true, "null は LINE 更新対象");
  assert.equal(isLineHostedAvatar(undefined), true, "undefined は LINE 更新対象");
  assert.equal(isLineHostedAvatar(""), true, "空文字は LINE 更新対象");
  assert.equal(
    isLineHostedAvatar("https://profile.line-scdn.net/0h12345"),
    true,
    "profile.line-scdn.net は LINE ホストと判定"
  );
  assert.equal(
    isLineHostedAvatar("https://obs.line-scdn.net/0h12345"),
    true,
    "obs.line-scdn.net は LINE ホストと判定"
  );
  assert.equal(
    isLineHostedAvatar("https://xxx.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg"),
    false,
    "Supabase Storage の独自アバターは LINE ホスト外と判定"
  );
  assert.equal(
    isLineHostedAvatar("https://evil-line-scdn.net/avatar.jpg"),
    false,
    "別ドメインの部分一致は拒否"
  );
  assert.equal(isLineHostedAvatar("not-a-valid-url"), false, "不正URLは更新対象外");

  console.log("[PASS] isLineHostedAvatar distinguishes LINE-hosted vs custom avatars");
}

// --- 4. isLineAvatarExpired tests ---
{
  const now = 2000000;
  const ttlMs = 100000;

  assert.equal(isLineAvatarExpired(null, ttlMs, now), true, "更新日時未設定(null)は更新対象");
  assert.equal(isLineAvatarExpired(undefined, ttlMs, now), true, "更新日時未設定(undefined)は更新対象");

  const recentDate = new Date(now - 50000); // 50秒前 (TTL内)
  assert.equal(isLineAvatarExpired(recentDate, ttlMs, now), false, "TTL内なら期限切れでない");

  const expiredDate = new Date(now - 100000); // 100秒前 (TTL到達)
  assert.equal(isLineAvatarExpired(expiredDate, ttlMs, now), true, "TTL到達なら期限切れ");

  const oldDate = new Date(now - 200000); // 200秒前 (TTL超過)
  assert.equal(isLineAvatarExpired(oldDate, ttlMs, now), true, "TTL超過なら期限切れ");

  console.log("[PASS] isLineAvatarExpired correctly checks avatar TTL");
}

// --- 5. fetchWithRetry tests ---
async function testFetchWithRetry() {
  let callCount = 0;
  const res = await fetchWithRetry(
    async () => {
      callCount++;
      if (callCount < 2) throw new Error("transient");
      return "ok";
    },
    { maxRetries: 2, retryDelayMs: 10 }
  );
  assert.equal(res, "ok");
  assert.equal(callCount, 2, "リトライにより復旧");

  let nonRetryableCalls = 0;
  await assert.rejects(
    async () =>
      fetchWithRetry(
        async () => {
          nonRetryableCalls++;
          throw new LineApiError("Unauthorized", { status: 401, retryable: false });
        },
        { maxRetries: 3, retryDelayMs: 10 }
      ),
    /Unauthorized/
  );
  assert.equal(nonRetryableCalls, 1, "retryable: false のエラーはリトライしない");

  console.log("[PASS] fetchWithRetry handles retries and non-retryable errors properly");
}

// --- 6. refreshLineAvatarIfExpired tests ---
async function testRefreshLineAvatarIfExpired() {
  const userId = "user-123";
  const lineUserId = "U123456789";

  // Case A: lineUserId がない（LINE連携していない）場合は更新不要
  {
    resetLineAvatarRefreshState();
    let updateCalled = false;
    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async () => {
          updateCalled = true;
        },
      },
    };

    const res = await refreshLineAvatarIfExpired(
      { userId, lineUserId: null, avatarIcon: "https://example.com/custom.png" },
      { dbClient: mockDb }
    );
    assert.equal(res.avatarIcon, "https://example.com/custom.png");
    assert.equal(res.updated, false);
    assert.equal(updateCalled, false, "DB更新は行われない");
  }

  // Case B: 独自アバター（LINEホスト以外のURL）が設定されている場合は期限切れでも上書きしない
  {
    resetLineAvatarRefreshState();
    const originalFetch = global.fetch;
    let fetchCalled = false;
    let updateCalled = false;
    const customAvatarUrl =
      "https://xxx.supabase.co/storage/v1/object/public/avatars/user-123/custom.jpg";

    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async () => {
          updateCalled = true;
        },
      },
    };

    global.fetch = async () => {
      fetchCalled = true;
      return new Response(
        JSON.stringify({ pictureUrl: "https://profile.line-scdn.net/overwrite" }),
        { status: 200 }
      );
    };

    try {
      const res = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: customAvatarUrl,
          avatarIconUpdatedAt: new Date(Date.now() - 100000), // 期限切れ
        },
        { ttlMs: 60000, dbClient: mockDb, channelAccessToken: "test-token" }
      );
      assert.equal(res.avatarIcon, customAvatarUrl, "独自アバターURLが保持される");
      assert.equal(res.updated, false);
      assert.equal(fetchCalled, false, "LINE APIは呼ばれない");
      assert.equal(updateCalled, false, "DB更新も行われない");
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Case C: TTL内の場合は更新不要
  {
    resetLineAvatarRefreshState();
    let updateCalled = false;
    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async () => {
          updateCalled = true;
        },
      },
    };

    const res = await refreshLineAvatarIfExpired(
      {
        userId,
        lineUserId,
        avatarIcon: "https://profile.line-scdn.net/abc",
        avatarIconUpdatedAt: new Date(), // 現在日時 (TTL内)
      },
      { ttlMs: 60000, dbClient: mockDb, channelAccessToken: "test-token" }
    );
    assert.equal(res.avatarIcon, "https://profile.line-scdn.net/abc");
    assert.equal(res.updated, false);
    assert.equal(updateCalled, false, "TTL内ならDB更新は行われない");
  }

  // Case D: TTL経過後にLINEから新しい画像URLを取得 -> DB更新
  {
    resetLineAvatarRefreshState();
    const originalFetch = global.fetch;
    const newPictureUrl = "https://profile.line-scdn.net/new-picture";
    let updatedData: { avatarIcon?: string | null; avatarIconUpdatedAt: Date } | null = null;

    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async (args) => {
          updatedData = args.data;
        },
      },
    };

    global.fetch = async () =>
      new Response(JSON.stringify({ pictureUrl: newPictureUrl }), { status: 200 });

    try {
      const res = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: "https://profile.line-scdn.net/old-picture",
          avatarIconUpdatedAt: new Date(Date.now() - 100000), // 期限切れ
        },
        { ttlMs: 60000, dbClient: mockDb, channelAccessToken: "test-token" }
      );
      assert.equal(res.avatarIcon, newPictureUrl);
      assert.equal(res.updated, true);
      assert.ok(updatedData !== null);
      const data = updatedData as { avatarIcon?: string | null; avatarIconUpdatedAt: Date };
      assert.equal(data.avatarIcon, newPictureUrl, "DBのavatarIconが更新される");
      assert.ok(data.avatarIconUpdatedAt instanceof Date, "DBの取得日時が更新される");
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Case E: TTL経過後に取得した画像URLが既存URLと同一の場合 -> avatarIconUpdatedAt のみ更新
  {
    resetLineAvatarRefreshState();
    const originalFetch = global.fetch;
    const samePictureUrl = "https://profile.line-scdn.net/same-picture";
    let updatedData: { avatarIcon?: string | null; avatarIconUpdatedAt: Date } | null = null;

    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async (args) => {
          updatedData = args.data;
        },
      },
    };

    global.fetch = async () =>
      new Response(JSON.stringify({ pictureUrl: samePictureUrl }), { status: 200 });

    try {
      const res = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: samePictureUrl,
          avatarIconUpdatedAt: new Date(Date.now() - 100000), // 期限切れ
        },
        { ttlMs: 60000, dbClient: mockDb, channelAccessToken: "test-token" }
      );
      assert.equal(res.avatarIcon, samePictureUrl);
      assert.equal(res.updated, false);
      assert.ok(updatedData !== null);
      const data = updatedData as { avatarIcon?: string | null; avatarIconUpdatedAt: Date };
      assert.equal(data.avatarIcon, undefined, "avatarIconの不要な更新は行われない");
      assert.ok(data.avatarIconUpdatedAt instanceof Date, "取得日時は更新される");
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Case F: LINE側で写真なし（pictureUrl未設定 または 404）の場合 -> 既存画像を保護し日時のみ更新
  {
    resetLineAvatarRefreshState();
    const originalFetch = global.fetch;
    const existingLineUrl = "https://profile.line-scdn.net/existing-protected";
    let updatedData: { avatarIcon?: string | null; avatarIconUpdatedAt: Date } | null = null;

    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async (args) => {
          updatedData = args.data;
        },
      },
    };

    global.fetch = async () => new Response(null, { status: 404 });

    try {
      const res = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: existingLineUrl,
          avatarIconUpdatedAt: new Date(Date.now() - 100000),
        },
        { ttlMs: 60000, dbClient: mockDb, channelAccessToken: "test-token" }
      );
      assert.equal(res.avatarIcon, existingLineUrl, "404時は既存LINE画像を消さずに保護");
      assert.equal(res.updated, false);
      assert.ok(updatedData !== null);
      const data = updatedData as { avatarIcon?: string | null; avatarIconUpdatedAt: Date };
      assert.equal(data.avatarIcon, undefined, "avatarIconはnullで上書きされない");
      assert.ok(data.avatarIconUpdatedAt instanceof Date, "取得日時は更新される");
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Case G: LINE API 500 取得失敗時 -> リトライ後に既存画像へフォールバック＆クールダウン期間中は再試行を抑制
  {
    resetLineAvatarRefreshState();
    const originalFetch = global.fetch;
    const prevRetries = process.env.LINE_API_MAX_RETRIES;
    const prevDelay = process.env.LINE_API_RETRY_DELAY_MS;
    process.env.LINE_API_MAX_RETRIES = "1";
    process.env.LINE_API_RETRY_DELAY_MS = "10";

    const existingIcon = "https://profile.line-scdn.net/existing-fallback";
    let attempts = 0;
    let updateCalled = false;
    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async () => {
          updateCalled = true;
        },
      },
    };

    global.fetch = async () => {
      attempts++;
      return new Response(null, { status: 500 });
    };

    try {
      const baseNow = 1_000_000;
      const res = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: existingIcon,
          avatarIconUpdatedAt: new Date(baseNow - 100000),
        },
        {
          ttlMs: 60000,
          failureCooldownMs: 60000,
          now: baseNow,
          dbClient: mockDb,
          channelAccessToken: "test-token",
        }
      );
      assert.equal(res.avatarIcon, existingIcon, "API失敗時は既存の画像URLをフォールバック返却");
      assert.equal(res.updated, false);
      assert.equal(attempts, 2, "初回+リトライ1回の計2回実行される");
      assert.equal(updateCalled, false, "失敗時はDBの更新日時を進めない");

      // クールダウン期間内の再呼び出しでは fetch が呼ばれないことを確認
      const secondRes = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: existingIcon,
          avatarIconUpdatedAt: new Date(baseNow - 100000),
        },
        {
          ttlMs: 60000,
          failureCooldownMs: 60000,
          now: baseNow + 1000,
          dbClient: mockDb,
          channelAccessToken: "test-token",
        }
      );
      assert.equal(secondRes.avatarIcon, existingIcon);
      assert.equal(attempts, 2, "クールダウン期間中はLINE APIを再試行しない");
    } finally {
      global.fetch = originalFetch;
      if (prevRetries !== undefined) process.env.LINE_API_MAX_RETRIES = prevRetries;
      else delete process.env.LINE_API_MAX_RETRIES;
      if (prevDelay !== undefined) process.env.LINE_API_RETRY_DELAY_MS = prevDelay;
      else delete process.env.LINE_API_RETRY_DELAY_MS;
    }
  }

  // Case H: LINE API 401/403 応答時 -> リトライせずエラーログを出し、更新日時を進めない
  {
    resetLineAvatarRefreshState();
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const existingIcon = "https://profile.line-scdn.net/existing-401";
    let attempts = 0;
    let updateCalled = false;
    const errorLogs: string[] = [];

    console.error = (...args: unknown[]) => {
      errorLogs.push(args.map(String).join(" "));
    };

    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async () => {
          updateCalled = true;
        },
      },
    };

    global.fetch = async () => {
      attempts++;
      return new Response(null, { status: 401 });
    };

    try {
      const res = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: existingIcon,
          avatarIconUpdatedAt: new Date(Date.now() - 100000),
        },
        { ttlMs: 60000, dbClient: mockDb, channelAccessToken: "invalid-token" }
      );
      assert.equal(res.avatarIcon, existingIcon, "401時は既存アイコンを維持");
      assert.equal(res.updated, false);
      assert.equal(attempts, 1, "401はリトライしない");
      assert.equal(updateCalled, false, "401時はavatarIconUpdatedAtを更新しない");
      assert.ok(
        errorLogs.some((log) => log.includes("401")),
        "401エラーがconsole.errorに出力される"
      );
    } finally {
      global.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  }

  // Case I: トークン未設定時 -> 初回のみ警告を出し、既存アイコンを維持
  {
    resetLineAvatarRefreshState();
    const prevMessagingToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
    const prevChannelToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const originalConsoleWarn = console.warn;
    const warnLogs: string[] = [];

    delete process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    console.warn = (...args: unknown[]) => {
      warnLogs.push(args.map(String).join(" "));
    };

    let updateCalled = false;
    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async () => {
          updateCalled = true;
        },
      },
    };

    try {
      const existingIcon = "https://profile.line-scdn.net/no-token";
      const res1 = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: existingIcon,
          avatarIconUpdatedAt: new Date(Date.now() - 100000),
        },
        { ttlMs: 60000, dbClient: mockDb }
      );
      const res2 = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: existingIcon,
          avatarIconUpdatedAt: new Date(Date.now() - 100000),
        },
        { ttlMs: 60000, dbClient: mockDb }
      );

      assert.equal(res1.avatarIcon, existingIcon);
      assert.equal(res2.avatarIcon, existingIcon);
      assert.equal(updateCalled, false);
      assert.equal(warnLogs.length, 1, "トークン未設定の警告は初回のみ出力される");
    } finally {
      console.warn = originalConsoleWarn;
      if (prevMessagingToken !== undefined) {
        process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = prevMessagingToken;
      }
      if (prevChannelToken !== undefined) {
        process.env.LINE_CHANNEL_ACCESS_TOKEN = prevChannelToken;
      }
    }
  }

  // Case J: db.profile.update が例外を投げた場合 -> 例外を握りつぶさずログ出力し、最新URLを返却
  {
    resetLineAvatarRefreshState();
    const originalFetch = global.fetch;
    const originalConsoleError = console.error;
    const newPictureUrl = "https://profile.line-scdn.net/db-error-new";
    const errorLogs: string[] = [];

    console.error = (...args: unknown[]) => {
      errorLogs.push(args.map(String).join(" "));
    };

    const failingDb: ProfileAvatarDbClient = {
      profile: {
        update: async () => {
          throw new Error("DB write failure");
        },
      },
    };

    global.fetch = async () =>
      new Response(JSON.stringify({ pictureUrl: newPictureUrl }), { status: 200 });

    try {
      const res = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: "https://profile.line-scdn.net/old",
          avatarIconUpdatedAt: new Date(Date.now() - 100000),
        },
        { ttlMs: 60000, dbClient: failingDb, channelAccessToken: "test-token" }
      );
      assert.equal(res.avatarIcon, newPictureUrl, "DB更新失敗時も取得済みの最新URLを返す");
      assert.equal(res.updated, false);
      assert.ok(
        errorLogs.some((log) => log.includes("Failed to update profile in database")),
        "DB更新失敗ログが出力される"
      );
    } finally {
      global.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  }

  // Case K: 同一ユーザーの同時リクエストで in-flight 共有され、API・DB 更新が重複しない
  {
    resetLineAvatarRefreshState();
    const originalFetch = global.fetch;
    const newPictureUrl = "https://profile.line-scdn.net/concurrent-new";
    let fetchCount = 0;
    let dbUpdateCount = 0;

    const mockDb: ProfileAvatarDbClient = {
      profile: {
        update: async () => {
          dbUpdateCount++;
        },
      },
    };

    global.fetch = async () => {
      fetchCount++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response(JSON.stringify({ pictureUrl: newPictureUrl }), { status: 200 });
    };

    try {
      const target = {
        userId,
        lineUserId,
        avatarIcon: "https://profile.line-scdn.net/concurrent-old",
        avatarIconUpdatedAt: new Date(Date.now() - 100000),
      };
      const [r1, r2] = await Promise.all([
        refreshLineAvatarIfExpired(target, {
          ttlMs: 60000,
          dbClient: mockDb,
          channelAccessToken: "test-token",
        }),
        refreshLineAvatarIfExpired(target, {
          ttlMs: 60000,
          dbClient: mockDb,
          channelAccessToken: "test-token",
        }),
      ]);
      assert.equal(r1.avatarIcon, newPictureUrl);
      assert.equal(r2.avatarIcon, newPictureUrl);
      assert.equal(fetchCount, 1, "同時リクエストでもLINE API呼び出しは1回のみ");
      assert.equal(dbUpdateCount, 1, "同時リクエストでもDB更新は1回のみ");
    } finally {
      global.fetch = originalFetch;
    }
  }

  console.log("[PASS] refreshLineAvatarIfExpired full workflow scenarios passed");
}

// --- 7. API Route integration tests (GET /api/profiles/[id] & POST /api/profiles) ---
async function testProfileApiRoutes() {
  resetLineAvatarRefreshState();
  const userId = "00000000-0000-0000-0000-000000000123";
  const refreshedUrl = "https://profile.line-scdn.net/route-refreshed";

  const origFindUnique = prisma.profile.findUnique;
  const origUpdate = prisma.profile.update;
  const origEventCount = prisma.event.count;
  const origParticipantCount = prisma.eventParticipant.count;
  const origFriendshipFindMany = prisma.friendship.findMany;
  const origFetch = global.fetch;
  const prevToken = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;

  process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = "test-route-token";

  try {
    (prisma.profile as unknown as { findUnique: typeof prisma.profile.findUnique }).findUnique =
      (async () => ({
        userId,
        lineUserId: "U999999",
        displayName: "テストユーザー",
        avatarIcon: "https://profile.line-scdn.net/route-stale",
        avatarIconUpdatedAt: new Date(Date.now() - DEFAULT_LINE_AVATAR_TTL_MS - 1000),
        gender: "unspecified",
        birthDate: null,
        playFrequency: null,
        drinkFrequency: null,
        budgetMin: null,
        budgetMax: null,
        ngFoods: [],
        favoriteAreas: [],
        favoritePlaces: [],
        availability: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as unknown as typeof prisma.profile.findUnique;

    (prisma.profile as unknown as { update: typeof prisma.profile.update }).update = (async (
      args: { data: { avatarIcon?: string | null } }
    ) => ({
      userId,
      avatarIcon: args.data.avatarIcon ?? refreshedUrl,
    })) as unknown as typeof prisma.profile.update;

    (prisma.event as unknown as { count: typeof prisma.event.count }).count = (async () =>
      1) as unknown as typeof prisma.event.count;
    (
      prisma.eventParticipant as unknown as { count: typeof prisma.eventParticipant.count }
    ).count = (async () => 2) as unknown as typeof prisma.eventParticipant.count;
    (
      prisma.friendship as unknown as { findMany: typeof prisma.friendship.findMany }
    ).findMany = (async () => []) as unknown as typeof prisma.friendship.findMany;

    global.fetch = async () =>
      new Response(JSON.stringify({ pictureUrl: refreshedUrl }), { status: 200 });

    const getRes = await getProfileById(
      new Request(`http://localhost/api/profiles/${userId}?viewerId=${userId}`),
      { params: Promise.resolve({ id: userId }) }
    );
    assert.equal(getRes.status, 200);
    const body = (await getRes.json()) as { avatarIcon?: string };
    assert.equal(
      body.avatarIcon,
      refreshedUrl,
      "GET /api/profiles/[id] が自動更新後の最新アバターURLを返す"
    );

    // POST /api/profiles: 不正な avatarIconUpdatedAt は 400 を返す
    const invalidDateRes = await upsertProfile(
      new Request("http://localhost/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          displayName: "テストユーザー",
          avatarIconUpdatedAt: "invalid-date",
        }),
      })
    );
    assert.equal(invalidDateRes.status, 400, "不正なavatarIconUpdatedAtは400を返す");

    // POST /api/profiles: 未来日時の avatarIconUpdatedAt は 400 を返す
    const futureDateRes = await upsertProfile(
      new Request("http://localhost/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          displayName: "テストユーザー",
          avatarIconUpdatedAt: new Date(Date.now() + 86400000).toISOString(),
        }),
      })
    );
    assert.equal(futureDateRes.status, 400, "未来日時のavatarIconUpdatedAtは400を返す");
  } finally {
    (prisma.profile as unknown as { findUnique: typeof prisma.profile.findUnique }).findUnique =
      origFindUnique;
    (prisma.profile as unknown as { update: typeof prisma.profile.update }).update = origUpdate;
    (prisma.event as unknown as { count: typeof prisma.event.count }).count = origEventCount;
    (
      prisma.eventParticipant as unknown as { count: typeof prisma.eventParticipant.count }
    ).count = origParticipantCount;
    (
      prisma.friendship as unknown as { findMany: typeof prisma.friendship.findMany }
    ).findMany = origFriendshipFindMany;
    global.fetch = origFetch;
    if (prevToken !== undefined) process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN = prevToken;
    else delete process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
    resetLineAvatarRefreshState();
  }

  console.log("[PASS] GET /api/profiles/[id] and POST /api/profiles route tests passed");
}

async function run() {
  await testFetchWithRetry();
  await testRefreshLineAvatarIfExpired();
  await testProfileApiRoutes();
  console.log("All line avatar cache tests passed successfully.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
