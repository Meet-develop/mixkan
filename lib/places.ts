import { prisma } from "@/lib/prisma";

type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  priceLevel?: number;
  photoUrl?: string;
};

type GooglePlaceSearchItem = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  vicinity?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  price_level?: number;
  photos?: Array<{ photo_reference?: string }>;
};

type GooglePlaceNewSearchItem = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  priceLevel?:
    | "PRICE_LEVEL_UNSPECIFIED"
    | "PRICE_LEVEL_FREE"
    | "PRICE_LEVEL_INEXPENSIVE"
    | "PRICE_LEVEL_MODERATE"
    | "PRICE_LEVEL_EXPENSIVE"
    | "PRICE_LEVEL_VERY_EXPENSIVE";
  photos?: Array<{ name?: string }>;
};

type GooglePlaceNewSearchResponse = {
  places?: GooglePlaceNewSearchItem[];
};

type GooglePlaceNewDetailsResponse = {
  photos?: Array<{ name?: string }>;
};

export const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24;

export const getPlacesPhotoTtlMs = (): number => {
  const envMs = process.env.PLACES_PHOTO_TTL_MS;
  if (envMs) {
    const parsed = parseInt(envMs, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const envSec = process.env.PLACES_PHOTO_TTL_SECONDS;
  if (envSec) {
    const parsed = parseInt(envSec, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed * 1000;
  }
  return DEFAULT_TTL_MS;
};

export const getPlacesApiRetryConfig = () => {
  const retriesEnv = process.env.PLACES_API_MAX_RETRIES;
  const delayEnv = process.env.PLACES_API_RETRY_DELAY_MS;
  const maxRetries = retriesEnv ? parseInt(retriesEnv, 10) : 2;
  const retryDelayMs = delayEnv ? parseInt(delayEnv, 10) : 500;
  return {
    maxRetries: Number.isNaN(maxRetries) || maxRetries < 0 ? 2 : maxRetries,
    retryDelayMs: Number.isNaN(retryDelayMs) || retryDelayMs < 0 ? 500 : retryDelayMs,
  };
};

export const isCacheExpired = (updatedAt: Date, ttlMs: number, now = Date.now()): boolean => {
  return now - updatedAt.getTime() >= ttlMs;
};

export async function fetchWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: {
    maxRetries: number;
    delayMs: number;
    onRetry?: (attempt: number, error: unknown) => void;
  }
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= options.maxRetries) {
        throw error;
      }
      attempt++;
      if (options.onRetry) {
        options.onRetry(attempt, error);
      }
      await new Promise((resolve) => setTimeout(resolve, options.delayMs * attempt));
    }
  }
}

const NEW_API_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.priceLevel,places.photos.name";

const NEW_API_DETAIL_FIELD_MASK = "photos.name";

const toPriceLevelNumber = (priceLevel?: GooglePlaceNewSearchItem["priceLevel"]) => {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
      return 0;
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return undefined;
  }
};

const toPlacesNewPhotoUrl = (photoName: string, apiKey: string) =>
  `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=320&key=${apiKey}`;

const hasSyntheticFallbackPlaces = (places: PlaceResult[]) =>
  places.some((place: PlaceResult) => place.placeId.includes("-fallback-"));

const isAreaLikePlace = (place: PlaceResult) => {
  const name = place.name.trim();
  const address = place.address.trim();
  const areaSuffixPattern = /(駅|市|区|町|村)$/;
  const areaKeywordPattern = /(駅|市|区|町|村|都|道|府|県)/;

  return areaSuffixPattern.test(name) || areaKeywordPattern.test(address);
};

const buildFallbackAreas = (query: string, limit = 6): PlaceResult[] => {
  const normalized = query.trim();
  const base = normalized.length > 0 ? normalized : "エリア";
  const names = [`${base}駅`, `${base}市`, `${base}区`];

  return names.slice(0, Math.min(limit, names.length)).map((name: string, index: number) => ({
    placeId: `area-${base}-${index + 1}`,
    name,
    address: `${base} 周辺`,
    lat: 35.6809591,
    lng: 139.7673068,
  }));
};

const findFallbackPlaces = async (query: string, limit = 6): Promise<PlaceResult[]> => {
  const cachedCandidates = await prisma.eventPlaceCandidate.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { address: { contains: query, mode: "insensitive" } },
      ],
    },
    distinct: ["placeId"],
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (cachedCandidates.length > 0) {
    return cachedCandidates.map((candidate: any) => ({
      placeId: candidate.placeId,
      name: candidate.name,
      address: candidate.address,
      lat: candidate.lat,
      lng: candidate.lng,
      priceLevel: candidate.priceLevel ?? undefined,
    }));
  }

  return Array.from({ length: Math.min(limit, 6) }).map((_: unknown, index: number) => ({
    placeId: `${query}-fallback-${index + 1}`,
    name: `${query} 候補${index + 1}`,
    address: "場所情報を検索して候補を作成しました",
    lat: 35.6809591,
    lng: 139.7673068,
    priceLevel: undefined,
  }));
};

const mapPlaces = (results: GooglePlaceSearchItem[]): PlaceResult[] =>
  results.flatMap((place: GooglePlaceSearchItem) => {
    const placeId = place.place_id?.trim();
    const name = place.name?.trim();

    if (!placeId || !name) {
      return [];
    }

    return [
      {
        placeId,
        name,
        address: place.formatted_address ?? place.vicinity ?? "",
        lat: place.geometry?.location?.lat ?? 0,
        lng: place.geometry?.location?.lng ?? 0,
        priceLevel: place.price_level,
        photoUrl: place.photos?.[0]?.photo_reference
          ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=320&photo_reference=${encodeURIComponent(place.photos[0].photo_reference)}&key=${process.env.GOOGLE_PLACES_API_KEY}`
          : undefined,
      },
    ];
  });

const mapPlacesNew = (
  results: GooglePlaceNewSearchItem[],
  apiKey: string
): PlaceResult[] =>
  results.flatMap((place: GooglePlaceNewSearchItem) => {
    const placeId = place.id?.trim();
    const name = place.displayName?.text?.trim();
    if (!placeId || !name) {
      return [];
    }

    const photoName = place.photos?.[0]?.name;
    return [
      {
        placeId,
        name,
        address: place.formattedAddress ?? "",
        lat: place.location?.latitude ?? 0,
        lng: place.location?.longitude ?? 0,
        priceLevel: toPriceLevelNumber(place.priceLevel),
        photoUrl: photoName ? toPlacesNewPhotoUrl(photoName, apiKey) : undefined,
      },
    ];
  });

const fetchPlacesWithNewApi = async (
  query: string,
  apiKey: string
): Promise<PlaceResult[]> => {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": NEW_API_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "ja",
    }),
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as GooglePlaceNewSearchResponse;
  return mapPlacesNew(payload.places ?? [], apiKey).slice(0, 10);
};

const fetchPlacesWithLegacyApi = async (
  query: string,
  apiKey: string
): Promise<PlaceResult[]> => {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as {
    results?: GooglePlaceSearchItem[];
  };

  return mapPlaces(payload.results ?? []).slice(0, 10);
};

export async function getPlacesForQuery(
  query: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  const cached = await prisma.placeCache.findUnique({
    where: { query },
  });

  if (cached) {
    const age = Date.now() - cached.updatedAt.getTime();
    if (age < ttlMs) {
      const data = cached.response as { places?: PlaceResult[] };
      const cachedPlaces = data.places ?? [];
      // If synthetic fallback results are cached, refresh from Google when API key is available.
      if (!(apiKey && hasSyntheticFallbackPlaces(cachedPlaces))) {
        return cachedPlaces;
      }
    }
  }

  if (!apiKey) {
    if (cached) {
      return (cached.response as { places?: PlaceResult[] }).places ?? [];
    }
    return findFallbackPlaces(query);
  }

  let places: PlaceResult[] = [];
  try {
    places = await fetchPlacesWithNewApi(query, apiKey);
    if (places.length === 0) {
      places = await fetchPlacesWithLegacyApi(query, apiKey);
    }
  } catch {
    places = [];
  }

  if (places.length === 0) {
    const fallback = await findFallbackPlaces(query);
    if (fallback.length > 0) {
      places = fallback;
    }
  }

  await prisma.placeCache.upsert({
    where: { query },
    create: { query, response: { places } },
    update: { response: { places } },
  });

  return places;
}

async function fetchPhotoUrlFromGooglePlaces(
  placeId: string,
  apiKey: string
): Promise<string | null> {
  try {
    const newDetailResponse = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": NEW_API_DETAIL_FIELD_MASK,
        },
      }
    );

    if (newDetailResponse.ok) {
      const payload = (await newDetailResponse.json()) as GooglePlaceNewDetailsResponse;
      const photoName = payload.photos?.[0]?.name;
      if (photoName) {
        return toPlacesNewPhotoUrl(photoName, apiKey);
      }
    } else if (newDetailResponse.status >= 500 || newDetailResponse.status === 429) {
      throw new Error(`Google Places New API HTTP ${newDetailResponse.status}`);
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes("HTTP 5") || error.message.includes("HTTP 429"))) {
      throw error;
    }
  }

  const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", "photo");
  detailsUrl.searchParams.set("key", apiKey);

  const legacyDetailResponse = await fetch(detailsUrl.toString());
  if (legacyDetailResponse.ok) {
    const legacyPayload = (await legacyDetailResponse.json()) as {
      result?: { photos?: Array<{ photo_reference?: string }> };
      status?: string;
    };
    if (legacyPayload.status === "OVER_QUERY_LIMIT") {
      throw new Error("Google Places Legacy API: OVER_QUERY_LIMIT");
    }
    const photoRef = legacyPayload.result?.photos?.[0]?.photo_reference;
    if (photoRef) {
      return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=320&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}`;
    }
  } else if (legacyDetailResponse.status >= 500 || legacyDetailResponse.status === 429) {
    throw new Error(`Google Places Legacy API HTTP ${legacyDetailResponse.status}`);
  }

  return null;
}

export async function getPlacePhotoUrlByPlaceId(
  placeId: string,
  ttlMs?: number,
  dbClient: typeof prisma = prisma
): Promise<string | null> {
  const effectiveTtlMs = ttlMs ?? getPlacesPhotoTtlMs();
  const cacheKey = `photo:${placeId}`;

  let cached: {
    query: string;
    response: unknown;
    updatedAt: Date;
    createdAt: Date;
  } | null = null;

  try {
    cached = await dbClient.placeCache.findUnique({ where: { query: cacheKey } });
  } catch (dbError) {
    console.error(`[PlacesCache] Failed to query cache for placeId: ${placeId}`, dbError);
  }

  let existingPhotoUrl: string | null = null;
  if (cached) {
    const data = cached.response as { photoUrl?: string | null };
    existingPhotoUrl = data?.photoUrl ?? null;
    if (!isCacheExpired(cached.updatedAt, effectiveTtlMs)) {
      return existingPhotoUrl;
    }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    if (existingPhotoUrl !== null) {
      console.warn(`[PlacesCache] No GOOGLE_PLACES_API_KEY. Using cached photoUrl for placeId: ${placeId}`);
      return existingPhotoUrl;
    }
    return null;
  }

  const { maxRetries, retryDelayMs } = getPlacesApiRetryConfig();
  let newPhotoUrl: string | null = null;

  try {
    newPhotoUrl = await fetchWithRetry(
      async () => fetchPhotoUrlFromGooglePlaces(placeId, apiKey),
      {
        maxRetries,
        delayMs: retryDelayMs,
        onRetry: (attempt, error) => {
          console.warn(
            `[PlacesCache] Retry ${attempt}/${maxRetries} for placeId: ${placeId}. Reason:`,
            error instanceof Error ? error.message : error
          );
        },
      }
    );
  } catch (error) {
    console.error(
      `[PlacesCache] Failed to fetch photo for placeId: ${placeId} after ${maxRetries} retries.`,
      error instanceof Error ? error.message : error
    );
    if (existingPhotoUrl !== null) {
      console.warn(`[PlacesCache] Falling back to existing cached photo URL for placeId: ${placeId}`);
      return existingPhotoUrl;
    }
    return null;
  }

  try {
    // 画像URLに変更がない場合、不要な更新を避けてupdatedAtのみ更新
    if (existingPhotoUrl && existingPhotoUrl === newPhotoUrl) {
      console.info(`[PlacesCache] Photo URL unchanged for placeId: ${placeId}. Touching updatedAt.`);
      await dbClient.placeCache.update({
        where: { query: cacheKey },
        data: { updatedAt: new Date() },
      });
      return newPhotoUrl;
    }

    // 最新の画像URLを取得した場合、保存済みのURLと取得日時を更新
    console.info(`[PlacesCache] Photo URL updated for placeId: ${placeId}`);
    await dbClient.placeCache.upsert({
      where: { query: cacheKey },
      create: {
        query: cacheKey,
        response: {
          photoUrl: newPhotoUrl,
          fetchedAt: new Date().toISOString(),
        },
      },
      update: {
        response: {
          photoUrl: newPhotoUrl,
          fetchedAt: new Date().toISOString(),
        },
      },
    });
  } catch (dbError) {
    console.error(`[PlacesCache] Failed to save photoUrl to cache for placeId: ${placeId}`, dbError);
  }

  return newPhotoUrl ?? existingPhotoUrl;
}

export async function getAreaCandidatesForQuery(
  query: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<PlaceResult[]> {
  const cacheKey = `area:${query}`;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const cached = await prisma.placeCache.findUnique({ where: { query: cacheKey } });

  if (cached) {
    const age = Date.now() - cached.updatedAt.getTime();
    if (age < ttlMs) {
      const data = cached.response as { areas?: PlaceResult[] };
      const cachedAreas = data.areas ?? [];
      if (cachedAreas.length > 0) {
        return cachedAreas;
      }
    }
  }

  if (!apiKey) {
    const fallback = buildFallbackAreas(query);
    await prisma.placeCache.upsert({
      where: { query: cacheKey },
      create: { query: cacheKey, response: { areas: fallback } },
      update: { response: { areas: fallback } },
    });
    return fallback;
  }

  let places: PlaceResult[] = [];
  try {
    places = await fetchPlacesWithNewApi(query, apiKey);
    if (places.length === 0) {
      places = await fetchPlacesWithLegacyApi(query, apiKey);
    }
  } catch {
    places = [];
  }

  const areaCandidates = places.filter(isAreaLikePlace);
  const source = areaCandidates.length > 0 ? areaCandidates : places;
  const uniqueById = new Map<string, PlaceResult>();

  for (const place of source) {
    if (!uniqueById.has(place.placeId)) {
      uniqueById.set(place.placeId, {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
      });
    }
    if (uniqueById.size >= 6) break;
  }

  let areas = Array.from(uniqueById.values()).slice(0, 6);
  if (areas.length === 0) {
    areas = buildFallbackAreas(query);
  }

  await prisma.placeCache.upsert({
    where: { query: cacheKey },
    create: { query: cacheKey, response: { areas } },
    update: { response: { areas } },
  });

  return areas;
}
