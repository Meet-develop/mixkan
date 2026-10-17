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

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24;

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
    return cachedCandidates.map((candidate) => ({
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

export async function getPlacePhotoUrlByPlaceId(
  placeId: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<string | null> {
  const cacheKey = `photo:${placeId}`;
  const cached = await prisma.placeCache.findUnique({ where: { query: cacheKey } });
  if (cached) {
    const age = Date.now() - cached.updatedAt.getTime();
    if (age < ttlMs) {
      const data = cached.response as { photoUrl?: string | null };
      return data.photoUrl ?? null;
    }
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return null;
  }

  let photoUrl: string | null = null;
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
        photoUrl = toPlacesNewPhotoUrl(photoName, apiKey);
      }
    }

    if (!photoUrl) {
      const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailsUrl.searchParams.set("place_id", placeId);
      detailsUrl.searchParams.set("fields", "photo");
      detailsUrl.searchParams.set("key", apiKey);

      const legacyDetailResponse = await fetch(detailsUrl.toString());
      if (legacyDetailResponse.ok) {
        const legacyPayload = (await legacyDetailResponse.json()) as {
          result?: { photos?: Array<{ photo_reference?: string }> };
        };
        const photoRef = legacyPayload.result?.photos?.[0]?.photo_reference;
        if (photoRef) {
          photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=320&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}`;
        }
      }
    }
  } catch {
    photoUrl = null;
  }

  await prisma.placeCache.upsert({
    where: { query: cacheKey },
    create: { query: cacheKey, response: { photoUrl } },
    update: { response: { photoUrl } },
  });

  return photoUrl;
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
