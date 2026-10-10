import assert from "node:assert/strict";
import {
  DEFAULT_LINE_AVATAR_TTL_MS,
  getLineAvatarTtlMs,
  getLineApiRetryConfig,
  isLineAvatarExpired,
  fetchWithRetry,
  refreshLineAvatarIfExpired,
} from "../lib/line-avatar";

// --- 1. getLineAvatarTtlMs tests ---
{
  const prevMs = process.env.LINE_AVATAR_TTL_MS;
  const prevSec = process.env.LINE_AVATAR_TTL_SECONDS;

  delete process.env.LINE_AVATAR_TTL_MS;
  delete process.env.LINE_AVATAR_TTL_SECONDS;
  assert.equal(getLineAvatarTtlMs(), DEFAULT_LINE_AVATAR_TTL_MS, "デフォルトで7日間が返る");

  process.env.LINE_AVATAR_TTL_MS = "86400000";
  assert.equal(getLineAvatarTtlMs(), 86400000, "LINE_AVATAR_TTL_MS が反映される");

  delete process.env.LINE_AVATAR_TTL_MS;
  process.env.LINE_AVATAR_TTL_SECONDS = "3600";
  assert.equal(getLineAvatarTtlMs(), 3600000, "LINE_AVATAR_TTL_SECONDS がミリ秒換算されて反映される");

  if (prevMs) process.env.LINE_AVATAR_TTL_MS = prevMs;
  else delete process.env.LINE_AVATAR_TTL_MS;
  if (prevSec) process.env.LINE_AVATAR_TTL_SECONDS = prevSec;
  else delete process.env.LINE_AVATAR_TTL_SECONDS;

  console.log("[PASS] getLineAvatarTtlMs configuration works");
}

// --- 2. getLineApiRetryConfig tests ---
{
  const prevRetries = process.env.LINE_API_MAX_RETRIES;
  const prevDelay = process.env.LINE_API_RETRY_DELAY_MS;

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

  if (prevRetries) process.env.LINE_API_MAX_RETRIES = prevRetries;
  else delete process.env.LINE_API_MAX_RETRIES;
  if (prevDelay) process.env.LINE_API_RETRY_DELAY_MS = prevDelay;
  else delete process.env.LINE_API_RETRY_DELAY_MS;

  console.log("[PASS] getLineApiRetryConfig configuration works");
}

// --- 3. isLineAvatarExpired tests ---
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

// --- 4. fetchWithRetry tests ---
async function testFetchWithRetry() {
  let callCount = 0;
  const res = await fetchWithRetry(async () => {
    callCount++;
    if (callCount < 2) throw new Error("transient");
    return "ok";
  }, { maxRetries: 2, delayMs: 10 });
  assert.equal(res, "ok");
  assert.equal(callCount, 2, "リトライにより復旧");

  console.log("[PASS] fetchWithRetry handles retries properly");
}

// --- 5. refreshLineAvatarIfExpired tests ---
async function testRefreshLineAvatarIfExpired() {
  const userId = "user-123";
  const lineUserId = "U123456789";

  // Case A: lineUserId がない（LINE連携していない）場合は更新不要
  {
    let updateCalled = false;
    const mockDb: any = {
      profile: {
        update: async () => { updateCalled = true; },
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

  // Case B: TTL内の場合は更新不要
  {
    let updateCalled = false;
    const mockDb: any = {
      profile: {
        update: async () => { updateCalled = true; },
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

  // Case C: TTL経過後にLINEから新しい画像URLを取得 -> DB更新
  {
    const originalFetch = global.fetch;
    const newPictureUrl = "https://profile.line-scdn.net/new-picture";
    let updatedData: any = null;

    const mockDb: any = {
      profile: {
        update: async (args: any) => {
          updatedData = args.data;
        },
      },
    };

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ pictureUrl: newPictureUrl }),
    }) as any;

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
      assert.equal(updatedData.avatarIcon, newPictureUrl, "DBのavatarIconが更新される");
      assert.ok(updatedData.avatarIconUpdatedAt instanceof Date, "DBの取得日時が更新される");
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Case D: TTL経過後に取得した画像URLが既存URLと同一の場合 -> avatarIconUpdatedAt のみ更新
  {
    const originalFetch = global.fetch;
    const samePictureUrl = "https://profile.line-scdn.net/same-picture";
    let updatedData: any = null;

    const mockDb: any = {
      profile: {
        update: async (args: any) => {
          updatedData = args.data;
        },
      },
    };

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ pictureUrl: samePictureUrl }),
    }) as any;

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
      assert.equal(updatedData.avatarIcon, undefined, "avatarIconの不要な更新は行われない");
      assert.ok(updatedData.avatarIconUpdatedAt instanceof Date, "取得日時は更新される");
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Case E: LINE API 取得失敗時 -> リトライ後に既存画像URLへフォールバック
  {
    const originalFetch = global.fetch;
    process.env.LINE_API_MAX_RETRIES = "1";
    process.env.LINE_API_RETRY_DELAY_MS = "10";

    const existingIcon = "https://profile.line-scdn.net/existing-fallback";
    let attempts = 0;
    const mockDb: any = {
      profile: {
        update: async () => {},
      },
    };

    global.fetch = async () => {
      attempts++;
      return {
        ok: false,
        status: 500,
      } as any;
    };

    try {
      const res = await refreshLineAvatarIfExpired(
        {
          userId,
          lineUserId,
          avatarIcon: existingIcon,
          avatarIconUpdatedAt: new Date(Date.now() - 100000), // 期限切れ
        },
        { ttlMs: 60000, dbClient: mockDb, channelAccessToken: "test-token" }
      );
      assert.equal(res.avatarIcon, existingIcon, "API失敗時は既存の画像URLをフォールバック返却");
      assert.equal(res.updated, false);
      assert.ok(attempts >= 2, "リトライが実行される");
    } finally {
      global.fetch = originalFetch;
    }
  }

  console.log("[PASS] refreshLineAvatarIfExpired full workflow scenarios passed");
}

async function run() {
  await testFetchWithRetry();
  await testRefreshLineAvatarIfExpired();
  console.log("All line avatar cache tests passed successfully.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
