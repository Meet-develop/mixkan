import assert from "node:assert/strict";
import {
  DEFAULT_TTL_MS,
  FAILURE_CACHE_TTL_MS,
  MAX_ALLOWED_RETRIES,
  PlacesApiError,
  getPlacesPhotoTtlMs,
  getPlacesApiRetryConfig,
  isCacheExpired,
  fetchWithRetry,
  getPlacePhotoUrlByPlaceId,
  type PlacePhotoCacheDbClient,
  type PlacePhotoCacheRecord,
  type PlacePhotoCacheUpsertArgs,
} from "../lib/places";

const withEnv = async <T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T> | T
): Promise<T> => {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const nextVal = overrides[key];
    if (nextVal === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextVal;
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      const prevVal = previous[key];
      if (prevVal === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prevVal;
      }
    }
  }
};

// --- 1. getPlacesPhotoTtlMs tests ---
async function testGetPlacesPhotoTtlMs() {
  await withEnv(
    { PLACES_PHOTO_TTL_MS: undefined, PLACES_PHOTO_TTL_SECONDS: undefined },
    () => {
      assert.equal(getPlacesPhotoTtlMs(), DEFAULT_TTL_MS, "デフォルトで24時間(DEFAULT_TTL_MS)が返る");
    }
  );

  await withEnv(
    { PLACES_PHOTO_TTL_MS: "3600000", PLACES_PHOTO_TTL_SECONDS: undefined },
    () => {
      assert.equal(getPlacesPhotoTtlMs(), 3600000, "PLACES_PHOTO_TTL_MS が反映される");
    }
  );

  await withEnv(
    { PLACES_PHOTO_TTL_MS: undefined, PLACES_PHOTO_TTL_SECONDS: "1800" },
    () => {
      assert.equal(getPlacesPhotoTtlMs(), 1800000, "PLACES_PHOTO_TTL_SECONDS がミリ秒換算されて反映される");
    }
  );

  await withEnv(
    { PLACES_PHOTO_TTL_MS: "5abc", PLACES_PHOTO_TTL_SECONDS: "-10" },
    () => {
      assert.equal(getPlacesPhotoTtlMs(), DEFAULT_TTL_MS, "不正な文字列・負数は無視されデフォルト値が返る");
    }
  );

  console.log("[PASS] getPlacesPhotoTtlMs configuration works");
}

// --- 2. getPlacesApiRetryConfig tests ---
async function testGetPlacesApiRetryConfig() {
  await withEnv(
    { PLACES_API_MAX_RETRIES: undefined, PLACES_API_RETRY_DELAY_MS: undefined },
    () => {
      const defConfig = getPlacesApiRetryConfig();
      assert.equal(defConfig.maxRetries, 1, "デフォルトリトライ回数は1回");
      assert.equal(defConfig.retryDelayMs, 300, "デフォルトリトライ間隔は300ms");
    }
  );

  await withEnv(
    { PLACES_API_MAX_RETRIES: "4", PLACES_API_RETRY_DELAY_MS: "1000" },
    () => {
      const customConfig = getPlacesApiRetryConfig();
      assert.equal(customConfig.maxRetries, 4, "環境変数PLACES_API_MAX_RETRIESが反映される");
      assert.equal(customConfig.retryDelayMs, 1000, "環境変数PLACES_API_RETRY_DELAY_MSが反映される");
    }
  );

  await withEnv(
    { PLACES_API_MAX_RETRIES: "99", PLACES_API_RETRY_DELAY_MS: "5abc" },
    () => {
      const cappedConfig = getPlacesApiRetryConfig();
      assert.equal(
        cappedConfig.maxRetries,
        MAX_ALLOWED_RETRIES,
        `PLACES_API_MAX_RETRIES は上限 (${MAX_ALLOWED_RETRIES}) でキャップされる`
      );
      assert.equal(cappedConfig.retryDelayMs, 300, "不正な文字列はデフォルト値にフォールバックする");
    }
  );

  console.log("[PASS] getPlacesApiRetryConfig configuration works");
}

// --- 3. isCacheExpired tests ---
function testIsCacheExpired() {
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
  const res1 = await fetchWithRetry(
    async () => {
      callCount++;
      return "ok";
    },
    { maxRetries: 2, delayMs: 10 }
  );
  assert.equal(res1, "ok");
  assert.equal(callCount, 1, "初回の試行で成功した場合はリトライされない");

  // リトライ成功: 2回目で成功（jitter 有効でも動作する）
  let retryAttempts: number[] = [];
  callCount = 0;
  const res2 = await fetchWithRetry(
    async () => {
      callCount++;
      if (callCount < 2) throw new PlacesApiError("transient error", { status: 503 });
      return "recovered";
    },
    {
      maxRetries: 2,
      delayMs: 10,
      jitter: true,
      onRetry: (attempt) => retryAttempts.push(attempt),
    }
  );
  assert.equal(res2, "recovered");
  assert.equal(callCount, 2, "2回目の試行で成功");
  assert.deepEqual(retryAttempts, [1], "onRetry コールバックが呼ばれる");

  // リトライ上限到達: 失敗
  callCount = 0;
  retryAttempts = [];
  let thrown = false;
  try {
    await fetchWithRetry(
      async () => {
        callCount++;
        throw new Error("persistent error");
      },
      {
        maxRetries: 2,
        delayMs: 10,
        onRetry: (attempt) => retryAttempts.push(attempt),
      }
    );
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
  await withEnv({ GOOGLE_PLACES_API_KEY: "test-api-key" }, async () => {
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
            updatedAt: new Date(),
            createdAt: new Date(),
          };
        },
        update: async () => {
          updateCalled = true;
        },
        upsert: async () => {
          upsertCalled = true;
        },
      },
    };

    const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
    assert.equal(url, "https://example.com/cached.jpg");
    assert.equal(findUniqueCalled, true);
    assert.equal(updateCalled, false, "TTL内なのでupdateは不要");
    assert.equal(upsertCalled, false, "TTL内なのでupsertは不要");
  });

  // Case B: TTL切れだがAPIキーがない場合 -> 既存キャッシュがあればフォールバック返却
  await withEnv({ GOOGLE_PLACES_API_KEY: undefined }, async () => {
    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => ({
          query: cacheKey,
          response: { photoUrl: "https://example.com/fallback-cached.jpg" },
          updatedAt: new Date(Date.now() - 100000),
          createdAt: new Date(Date.now() - 100000),
        }),
        update: async () => {},
        upsert: async () => {},
      },
    };

    const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
    assert.equal(url, "https://example.com/fallback-cached.jpg", "APIキーなしでも既存キャッシュを返す");
  });

  // Case C: キャッシュなしでAPIキーもない場合 -> null を返してエラーにならない
  await withEnv({ GOOGLE_PLACES_API_KEY: undefined }, async () => {
    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => null,
        update: async () => {},
        upsert: async () => {},
      },
    };

    const url = await getPlacePhotoUrlByPlaceId("non-existent-place", 60000, mockDb);
    assert.equal(url, null, "キャッシュなし・APIキーなしの場合はnull");
  });

  // Case D: TTL切れでAPIから最新URLを取得（URLが新しくなった場合 -> upsertが呼ばれる）
  await withEnv({ GOOGLE_PLACES_API_KEY: "test-api-key" }, async () => {
    const originalFetch = global.fetch;

    let upsertPayload: PlacePhotoCacheUpsertArgs | null = null;
    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => ({
          query: cacheKey,
          response: { photoUrl: "https://example.com/old-photo.jpg" },
          updatedAt: new Date(Date.now() - 100000),
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
      assert.equal(typeof payload.create.response.lastChangedAt, "string");
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Case E: TTL切れでAPIから取得したURLが既存URLと同一の場合 -> 不要なupsertをスキップしupdate(updatedAt)のみ
  await withEnv({ GOOGLE_PLACES_API_KEY: "test-api-key" }, async () => {
    const originalFetch = global.fetch;
    const existingUrl =
      "https://places.googleapis.com/v1/places/test/photos/same-photo-ref/media?maxWidthPx=320&key=test-api-key";

    let updateCalled = false;
    let upsertCalled = false;
    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => ({
          query: cacheKey,
          response: { photoUrl: existingUrl },
          updatedAt: new Date(Date.now() - 100000),
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
  });

  // Case F: TTL切れでAPI呼び出しが失敗した場合 -> リトライ後、既存のキャッシュURLへフォールバック
  await withEnv(
    {
      GOOGLE_PLACES_API_KEY: "test-api-key",
      PLACES_API_MAX_RETRIES: "1",
      PLACES_API_RETRY_DELAY_MS: "10",
    },
    async () => {
      const originalFetch = global.fetch;

      const cachedUrl = "https://example.com/existing-fallback.jpg";
      let fetchAttempts = 0;
      let upsertCalled = false;
      const mockDb: PlacePhotoCacheDbClient = {
        placeCache: {
          findUnique: async () => ({
            query: cacheKey,
            response: { photoUrl: cachedUrl },
            updatedAt: new Date(Date.now() - 100000),
            createdAt: new Date(Date.now() - 100000),
          }),
          update: async () => {},
          upsert: async () => {
            upsertCalled = true;
          },
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
        assert.equal(upsertCalled, false, "既存キャッシュがある場合は失敗で上書きしない");
      } finally {
        global.fetch = originalFetch;
      }
    }
  );

  // Case G (Review 1): 新 API が 503 / 429 で失敗しても、旧 API (Legacy) へフォールバックして写真を取得できる
  for (const errorStatus of [503, 429]) {
    await withEnv(
      {
        GOOGLE_PLACES_API_KEY: "test-api-key",
        PLACES_API_MAX_RETRIES: "1",
        PLACES_API_RETRY_DELAY_MS: "5",
      },
      async () => {
        const originalFetch = global.fetch;
        let newApiCalls = 0;
        let legacyApiCalls = 0;

        const mockDb: PlacePhotoCacheDbClient = {
          placeCache: {
            findUnique: async () => null,
            update: async () => {},
            upsert: async () => {},
          },
        };

        global.fetch = async (input) => {
          const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (urlStr.includes("places.googleapis.com/v1/places")) {
            newApiCalls++;
            return new Response(null, { status: errorStatus });
          }
          legacyApiCalls++;
          return new Response(
            JSON.stringify({
              status: "OK",
              result: {
                photos: [{ photo_reference: `legacy-photo-${errorStatus}` }],
              },
            }),
            { status: 200 }
          );
        };

        try {
          const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
          assert.ok(
            url?.includes(`legacy-photo-${errorStatus}`),
            `新APIが${errorStatus}でも旧APIから写真URLを取得できる`
          );
          assert.equal(newApiCalls, 1, "新APIは1回試行して旧APIへ進む");
          assert.equal(legacyApiCalls, 1, "旧APIが呼ばれて成功する");
        } finally {
          global.fetch = originalFetch;
        }
      }
    );
  }

  // Case H (Review 2): 既存キャッシュがある状態で API が「写真なし (null)」を返した場合、nullで上書きせず既存キャッシュを保持する
  await withEnv({ GOOGLE_PLACES_API_KEY: "test-api-key" }, async () => {
    const originalFetch = global.fetch;
    const cachedUrl = "https://example.com/keep-this-photo.jpg";
    let upsertCalled = false;

    const mockDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => ({
          query: cacheKey,
          response: { photoUrl: cachedUrl },
          updatedAt: new Date(Date.now() - 100000),
          createdAt: new Date(Date.now() - 100000),
        }),
        update: async () => {},
        upsert: async () => {
          upsertCalled = true;
        },
      },
    };

    global.fetch = async (input) => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes("places.googleapis.com/v1/places")) {
        return new Response(JSON.stringify({ photos: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ status: "OK", result: { photos: [] } }), { status: 200 });
    };

    try {
      const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
      assert.equal(url, cachedUrl, "写真なし(null)が返っても既存のキャッシュURLが返る");
      assert.equal(upsertCalled, false, "既存の有効なキャッシュをnullでupsert上書きしない");
    } finally {
      global.fetch = originalFetch;
    }
  });

  // Case I (Review 2 & 4): 旧 API が OVER_QUERY_LIMIT / REQUEST_DENIED を返した場合はエラー扱いとなりリトライ・フォールバックされる
  await withEnv(
    {
      GOOGLE_PLACES_API_KEY: "test-api-key",
      PLACES_API_MAX_RETRIES: "1",
      PLACES_API_RETRY_DELAY_MS: "5",
    },
    async () => {
      const originalFetch = global.fetch;
      let legacyCalls = 0;

      const mockDb: PlacePhotoCacheDbClient = {
        placeCache: {
          findUnique: async () => ({
            query: cacheKey,
            response: { photoUrl: "https://example.com/cached-for-oql.jpg" },
            updatedAt: new Date(Date.now() - 100000),
            createdAt: new Date(Date.now() - 100000),
          }),
          update: async () => {},
          upsert: async () => {},
        },
      };

      global.fetch = async (input) => {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (urlStr.includes("places.googleapis.com/v1/places")) {
          return new Response(null, { status: 403 });
        }
        legacyCalls++;
        if (legacyCalls === 1) {
          return new Response(JSON.stringify({ status: "OVER_QUERY_LIMIT" }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            status: "OK",
            result: { photos: [{ photo_reference: "recovered-after-oql" }] },
          }),
          { status: 200 }
        );
      };

      try {
        const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, mockDb);
        assert.ok(url?.includes("recovered-after-oql"), "OVER_QUERY_LIMIT 後にリトライして回復する");
        assert.equal(legacyCalls, 2, "旧APIがリトライされる");
      } finally {
        global.fetch = originalFetch;
      }
    }
  );

  // Case J (Review 3): キャッシュなしでAPIが全滅した場合、失敗結果(failed: true)を短TTLで記録し、直後の再リクエストでAPIを叩かない
  await withEnv(
    {
      GOOGLE_PLACES_API_KEY: "test-api-key",
      PLACES_API_MAX_RETRIES: "0",
      PLACES_API_RETRY_DELAY_MS: "5",
    },
    async () => {
      const originalFetch = global.fetch;
      const state: { record: PlacePhotoCacheRecord | null } = { record: null };
      let fetchCalls = 0;

      const mockDb: PlacePhotoCacheDbClient = {
        placeCache: {
          findUnique: async () => state.record,
          update: async () => {},
          upsert: async (args) => {
            state.record = {
              query: args.where.query,
              response: args.create.response,
              updatedAt: new Date(),
              createdAt: new Date(),
            };
          },
        },
      };

      global.fetch = async () => {
        fetchCalls++;
        return new Response(null, { status: 503 });
      };

      try {
        const firstUrl = await getPlacePhotoUrlByPlaceId(placeId, DEFAULT_TTL_MS, mockDb);
        assert.equal(firstUrl, null);
        assert.ok(state.record !== null, "失敗状態がキャッシュに記録される");
        const callsAfterFirst = fetchCalls;
        assert.ok(callsAfterFirst > 0);

        // 直後の2回目呼び出し: 失敗キャッシュTTL内なのでfetchされない
        const secondUrl = await getPlacePhotoUrlByPlaceId(placeId, DEFAULT_TTL_MS, mockDb);
        assert.equal(secondUrl, null);
        assert.equal(fetchCalls, callsAfterFirst, "失敗キャッシュTTL内はAPIを再呼び出ししない");

        // FAILURE_CACHE_TTL_MS 経過後は再取得が走る
        state.record.updatedAt = new Date(Date.now() - FAILURE_CACHE_TTL_MS - 1000);
        await getPlacePhotoUrlByPlaceId(placeId, DEFAULT_TTL_MS, mockDb);
        assert.ok(fetchCalls > callsAfterFirst, "失敗キャッシュTTL経過後は再度API呼び出しを行う");
      } finally {
        global.fetch = originalFetch;
      }
    }
  );

  // Case K (Review 4 & 6): DB 読み書き失敗時や不正な response 形式でも例外で落ちずに処理を継続する
  await withEnv({ GOOGLE_PLACES_API_KEY: "test-api-key" }, async () => {
    const originalFetch = global.fetch;

    const brokenDb: PlacePhotoCacheDbClient = {
      placeCache: {
        findUnique: async () => {
          throw new Error("DB connection failed on read");
        },
        update: async () => {
          throw new Error("DB connection failed on update");
        },
        upsert: async () => {
          throw new Error("DB connection failed on upsert");
        },
      },
    };

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          photos: [{ name: "places/test/photos/db-error-resilient" }],
        }),
        { status: 200 }
      );

    try {
      const url = await getPlacePhotoUrlByPlaceId(placeId, 60000, brokenDb);
      assert.ok(url?.includes("db-error-resilient"), "DBが読み書き失敗してもAPIから取得したURLを返す");
    } finally {
      global.fetch = originalFetch;
    }
  });

  console.log("[PASS] getPlacePhotoUrlByPlaceId cache, fallback, error, and DB failure scenarios passed");
}

async function run() {
  await testGetPlacesPhotoTtlMs();
  await testGetPlacesApiRetryConfig();
  testIsCacheExpired();
  await testFetchWithRetry();
  await testGetPlacePhotoUrlByPlaceId();
  console.log("All places photo cache tests passed successfully.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
