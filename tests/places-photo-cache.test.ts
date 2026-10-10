import assert from "node:assert/strict";
import {
  DEFAULT_TTL_MS,
  getPlacesPhotoTtlMs,
  getPlacesApiRetryConfig,
  isCacheExpired,
  fetchWithRetry,
  getPlacePhotoUrlByPlaceId,
  type PlacePhotoCacheDbClient,
  type PlacePhotoCacheUpsertArgs,
} from "../lib/places";

// --- 1. getPlacesPhotoTtlMs tests ---
{
  const prevMs = process.env.PLACES_PHOTO_TTL_MS;
  const prevSec = process.env.PLACES_PHOTO_TTL_SECONDS;

  delete process.env.PLACES_PHOTO_TTL_MS;
  delete process.env.PLACES_PHOTO_TTL_SECONDS;
  assert.equal(getPlacesPhotoTtlMs(), DEFAULT_TTL_MS, "デフォルトで24時間(DEFAULT_TTL_MS)が返る");

  process.env.PLACES_PHOTO_TTL_MS = "3600000";
  assert.equal(getPlacesPhotoTtlMs(), 3600000, "PLACES_PHOTO_TTL_MS が反映される");

  delete process.env.PLACES_PHOTO_TTL_MS;
  process.env.PLACES_PHOTO_TTL_SECONDS = "1800";
  assert.equal(getPlacesPhotoTtlMs(), 1800000, "PLACES_PHOTO_TTL_SECONDS がミリ秒換算されて反映される");

  if (prevMs) process.env.PLACES_PHOTO_TTL_MS = prevMs;
  else delete process.env.PLACES_PHOTO_TTL_MS;
  if (prevSec) process.env.PLACES_PHOTO_TTL_SECONDS = prevSec;
  else delete process.env.PLACES_PHOTO_TTL_SECONDS;

  console.log("[PASS] getPlacesPhotoTtlMs configuration works");
}

// --- 2. getPlacesApiRetryConfig tests ---
{
  const prevRetries = process.env.PLACES_API_MAX_RETRIES;
  const prevDelay = process.env.PLACES_API_RETRY_DELAY_MS;

  delete process.env.PLACES_API_MAX_RETRIES;
  delete process.env.PLACES_API_RETRY_DELAY_MS;
  const defConfig = getPlacesApiRetryConfig();
  assert.equal(defConfig.maxRetries, 2, "デフォルトリトライ回数は2回");
  assert.equal(defConfig.retryDelayMs, 500, "デフォルトリトライ間隔は500ms");

  process.env.PLACES_API_MAX_RETRIES = "4";
  process.env.PLACES_API_RETRY_DELAY_MS = "1000";
  const customConfig = getPlacesApiRetryConfig();
  assert.equal(customConfig.maxRetries, 4, "環境変数PLACES_API_MAX_RETRIESが反映される");
  assert.equal(customConfig.retryDelayMs, 1000, "環境変数PLACES_API_RETRY_DELAY_MSが反映される");

  if (prevRetries) process.env.PLACES_API_MAX_RETRIES = prevRetries;
  else delete process.env.PLACES_API_MAX_RETRIES;
  if (prevDelay) process.env.PLACES_API_RETRY_DELAY_MS = prevDelay;
  else delete process.env.PLACES_API_RETRY_DELAY_MS;

  console.log("[PASS] getPlacesApiRetryConfig configuration works");
}

// --- 3. isCacheExpired tests ---
{
  const now = 1000000;
  const ttlMs = 60000;

  const validDate = new Date(now - 30000); // 30秒前 (TTL内)
  assert.equal(isCacheExpired(validDate, ttlMs, now), false, "TTL内なら期限切れでない");

  const expiredDate = new Date(now - 60000); // 60秒前 (TTL到達)
  assert.equal(isCacheExpired(expiredDate, ttlMs, now), true, "TTL到達なら期限切れ");

  const oldDate = new Date(now - 120000); // 120秒前 (TTL超過)
  assert.equal(isCacheExpired(oldDate, ttlMs, now), true, "TTL超過なら期限切れ");

  console.log("[PASS] isCacheExpired correctly checks TTL expiration");
}

// --- 4. fetchWithRetry tests ---
async function testFetchWithRetry() {
  // 正常系: 1回目で成功
  let callCount = 0;
  const res1 = await fetchWithRetry(async () => {
    callCount++;
    return "ok";
  }, { maxRetries: 2, delayMs: 10 });
  assert.equal(res1, "ok");
  assert.equal(callCount, 1, "初回の試行で成功した場合はリトライされない");

  // リトライ成功: 2回目で成功
  let retryAttempts: number[] = [];
  callCount = 0;
  const res2 = await fetchWithRetry(async () => {
    callCount++;
    if (callCount < 2) throw new Error("transient error");
    return "recovered";
  }, {
    maxRetries: 2,
    delayMs: 10,
    onRetry: (attempt) => retryAttempts.push(attempt),
  });
  assert.equal(res2, "recovered");
  assert.equal(callCount, 2, "2回目の試行で成功");
  assert.deepEqual(retryAttempts, [1], "onRetry コールバックが呼ばれる");

  // リトライ上限到達: 失敗
  callCount = 0;
  retryAttempts = [];
  let thrown = false;
  try {
    await fetchWithRetry(async () => {
      callCount++;
      throw new Error("persistent error");
    }, {
      maxRetries: 2,
      delayMs: 10,
      onRetry: (attempt) => retryAttempts.push(attempt),
    });
  } catch (e) {
    thrown = true;
    assert.equal((e as Error).message, "persistent error");
  }
  assert.equal(thrown, true, "リトライ上限到達時に例外がスローされる");
  assert.equal(callCount, 3, "初回 + リトライ2回で計3回呼ばれる");
  assert.deepEqual(retryAttempts, [1, 2]);

  console.log("[PASS] fetchWithRetry handles success, retries, and max limits");
}

// --- 5. getPlacePhotoUrlByPlaceId with mock dbClient ---
async function testGetPlacePhotoUrlByPlaceId() {
  const placeId = "test-place-123";
  const cacheKey = `photo:${placeId}`;

  // Case A: TTL内キャッシュが存在する場合 -> APIを呼ばずにキャッシュを返却
  {
    let findUniqueCalled = false;
    let updateCalled = false;
    let upsertCalled = false;

    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => {
          findUniqueCalled = true;
          return {
            query: cacheKey,
            response: { photoUrl: "https://example.com/cached.jpg" },
            updatedAt: new Date(), // 作成直後 (TTL内)
            createdAt: new Date(),
          };
        },
        update: async () => { updateCalled = true; },
        upsert: async () => { upsertCalled = true; },
      },
    };

    const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
    assert.equal(url, "https://example.com/cached.jpg");
    assert.equal(findUniqueCalled, true);
    assert.equal(updateCalled, false, "TTL内なのでupdateは不要");
    assert.equal(upsertCalled, false, "TTL内なのでupsertは不要");
  }

  // Case B: TTL切れだがAPIキーがない場合 -> 既存キャッシュがあればフォールバック返却
  {
    const prevKey = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;

    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => ({
          query: cacheKey,
          response: { photoUrl: "https://example.com/fallback-cached.jpg" },
          updatedAt: new Date(Date.now() - 100000), // 期限切れ
          createdAt: new Date(Date.now() - 100000),
        }),
        update: async () => {},
        upsert: async () => {},
      },
    };

    const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
    assert.equal(url, "https://example.com/fallback-cached.jpg", "APIキーなしでも既存キャッシュを返す");

    if (prevKey) process.env.GOOGLE_PLACES_API_KEY = prevKey;
  }

  // Case C: キャッシュなしでAPIキーもない場合 -> null を返してエラーにならない
  {
    const prevKey = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;

    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => null,
        update: async () => {},
        upsert: async () => {},
      },
    };

    const url = await getPlacePhotoUrlByPlaceId("non-existent-place", 60000, mockDb);
    assert.equal(url, null, "キャッシュなし・APIキーなしの場合はnull");

    if (prevKey) process.env.GOOGLE_PLACES_API_KEY = prevKey;
  }

  // Case D: TTL切れでAPIから最新URLを取得（URLが新しくなった場合 -> upsertが呼ばれる）
  {
    const originalFetch = global.fetch;
    process.env.GOOGLE_PLACES_API_KEY = "test-api-key";

    let upsertPayload: PlacePhotoCacheUpsertArgs | null = null;
    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => ({
          query: cacheKey,
          response: { photoUrl: "https://example.com/old-photo.jpg" },
          updatedAt: new Date(Date.now() - 100000), // 期限切れ
          createdAt: new Date(Date.now() - 100000),
        }),
        update: async () => {},
        upsert: async (args) => {
          upsertPayload = args;
        },
      },
    };

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          photos: [{ name: "places/test/photos/new-photo-ref" }],
        }),
        { status: 200 }
      );

    try {
      const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
      assert.ok(url?.includes("new-photo-ref"), "新しい写真URLが返る");
      assert.ok(upsertPayload !== null, "DBにupsertされる");
      const payload = upsertPayload as PlacePhotoCacheUpsertArgs;
      assert.equal(payload.create.response.photoUrl, url);
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Case E: TTL切れでAPIから取得したURLが既存URLと同一の場合 -> 不要なupsertをスキップしupdate(updatedAt)のみ
  {
    const originalFetch = global.fetch;
    process.env.GOOGLE_PLACES_API_KEY = "test-api-key";
    const existingUrl = "https://places.googleapis.com/v1/places/test/photos/same-photo-ref/media?maxWidthPx=320&key=test-api-key";

    let updateCalled = false;
    let upsertCalled = false;
    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => ({
          query: cacheKey,
          response: { photoUrl: existingUrl },
          updatedAt: new Date(Date.now() - 100000), // 期限切れ
          createdAt: new Date(Date.now() - 100000),
        }),
        update: async () => {
          updateCalled = true;
        },
        upsert: async () => {
          upsertCalled = true;
        },
      },
    };

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          photos: [{ name: "places/test/photos/same-photo-ref" }],
        }),
        { status: 200 }
      );

    try {
      const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
      assert.equal(url, existingUrl);
      assert.equal(updateCalled, true, "URL同一時はupdatedAt更新が行われる");
      assert.equal(upsertCalled, false, "URL同一時は不要なupsertを行わない");
    } finally {
      global.fetch = originalFetch;
    }
  }

  // Case F: TTL切れでAPI呼び出しが失敗した場合 -> リトライ後、既存のキャッシュURLへフォールバック
  {
    const originalFetch = global.fetch;
    process.env.GOOGLE_PLACES_API_KEY = "test-api-key";
    process.env.PLACES_API_MAX_RETRIES = "1";
    process.env.PLACES_API_RETRY_DELAY_MS = "10";

    const cachedUrl = "https://example.com/existing-fallback.jpg";
    let fetchAttempts = 0;
    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => ({
          query: cacheKey,
          response: { photoUrl: cachedUrl },
          updatedAt: new Date(Date.now() - 100000), // 期限切れ
          createdAt: new Date(Date.now() - 100000),
        }),
        update: async () => {},
        upsert: async () => {},
      },
    };

    global.fetch = async () => {
      fetchAttempts++;
      return new Response(null, { status: 500 });
    };

    try {
      const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
      assert.equal(url, cachedUrl, "API失敗時は既存のキャッシュURLへフォールバックする");
      assert.ok(fetchAttempts >= 2, "リトライが実行される");
    } finally {
      global.fetch = originalFetch;
    }
  }

  console.log("[PASS] getPlacePhotoUrlByPlaceId cache and fallback scenarios passed");
}

async function run() {
  await testFetchWithRetry();
  await testGetPlacePhotoUrlByPlaceId();
  console.log("All places photo cache tests passed successfully.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
