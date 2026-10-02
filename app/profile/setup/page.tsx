"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getAvatarToneClass, isImageAvatar } from "@/components/ui/avatar-name";

type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Slot = { daytime: boolean; night: boolean };
type WeekdaySlots = Record<WeekdayKey, Slot>;

type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  priceLevel?: number;
  photoUrl?: string;
};

type ProfileStats = {
  hostedCount: number;
  participatingCount: number;
  friendCount: number;
  completionRate: number;
};

type ProfileResponse = {
  displayName?: string;
  avatarIcon?: string | null;
  gender?: string;
  birthDate?: string | null;
  playFrequency?: string | null;
  drinkFrequency?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  ngFoods?: string[];
  favoriteAreas?: string[];
  favoritePlaces?: string[];
  availability?: unknown;
  stats?: ProfileStats;
};

type ProfileFormSnapshot = {
  displayName: string;
  avatarIcon: string;
  gender: string;
  birthDate: string;
  playFrequency: string;
  drinkFrequency: string;
  budgetOption: BudgetOptionId;
  ngFoods: string[];
  favoriteAreas: string[];
  favoritePlaces: string[];
  weekdaySlots: WeekdaySlots;
  frequentPlaces: Array<{
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    photoUrl?: string;
  }>;
};

const PROFILE_COMPLETION_THRESHOLD = 100;

const genderOptions = [
  { value: "unspecified", label: "未設定" },
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
  { value: "other", label: "その他" },
];

const playFrequencyOptions = [
  { value: "", label: "未設定" },
  { value: "low", label: "月1-2回" },
  { value: "medium", label: "週1-2回" },
  { value: "high", label: "週3回以上" },
];

const drinkFrequencyOptions = [
  { value: "", label: "未設定" },
  { value: "never", label: "飲まない" },
  { value: "sometimes", label: "たまに" },
  { value: "often", label: "よく飲む" },
];

const AVATAR_BUCKET_NAME = "avatars";
const AVATAR_MAX_UPLOAD_BYTES = 100 * 1024;
const AVATAR_MAX_DIMENSION = 720;
const NG_FOOD_NONE_OPTION = "なし";
const UNSAVED_FIELD_NOTICE = "更新ボタンを押さないと更新されません。";

const budgetOptions = [
  { id: "upto2000", label: "～2000円", min: 0, max: 2000 },
  { id: "2000to3000", label: "2000円～3000円", min: 2000, max: 3000 },
  { id: "3000to5000", label: "3000円～5000円", min: 3000, max: 5000 },
  { id: "5000to10000", label: "5000円～10000円", min: 5000, max: 10000 },
  { id: "over10000", label: "10000円～", min: 10000, max: null as number | null },
] as const;

type BudgetOptionId = (typeof budgetOptions)[number]["id"];

const dayLabels: Record<WeekdayKey, string> = {
  mon: "月曜",
  tue: "火曜",
  wed: "水曜",
  thu: "木曜",
  fri: "金曜",
  sat: "土曜",
  sun: "日曜",
};

const plusButtonClass =
  "grid h-7 w-7 place-items-center rounded-full border border-dashed border-gray-400 bg-gray-50 text-gray-500";

const defaultStats: ProfileStats = {
  hostedCount: 0,
  participatingCount: 0,
  friendCount: 0,
  completionRate: 0,
};

const defaultNgFoodOptions = [
  NG_FOOD_NONE_OPTION,
  "辛いもの",
  "甲殻類",
  "乳製品",
  "パクチー",
  "生魚",
  "香草系",
  "揚げ物",
  "炭酸",
] as const;

const normalizeStringArray = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );

const normalizeNgFoods = (values?: string[] | null) => {
  const cleaned = normalizeStringArray(values ?? []);
  if (cleaned.length === 0) {
    return [NG_FOOD_NONE_OPTION];
  }

  const withoutNone = cleaned.filter((value) => value !== NG_FOOD_NONE_OPTION);
  return withoutNone.length > 0 ? withoutNone : [NG_FOOD_NONE_OPTION];
};

const toComparableWeekdaySlots = (slots: WeekdaySlots): WeekdaySlots => ({
  mon: { ...slots.mon },
  tue: { ...slots.tue },
  wed: { ...slots.wed },
  thu: { ...slots.thu },
  fri: { ...slots.fri },
  sat: { ...slots.sat },
  sun: { ...slots.sun },
});

const createProfileSnapshot = (payload: {
  displayName: string;
  avatarIcon: string;
  gender: string;
  birthDate: string;
  playFrequency: string;
  drinkFrequency: string;
  budgetOption: BudgetOptionId;
  ngFoods: string[];
  favoriteAreas: string[];
  favoritePlaces: string[];
  weekdaySlots: WeekdaySlots;
  frequentPlaces: PlaceResult[];
}): ProfileFormSnapshot => ({
  displayName: payload.displayName.trim(),
  avatarIcon: payload.avatarIcon,
  gender: payload.gender,
  birthDate: payload.birthDate,
  playFrequency: payload.playFrequency,
  drinkFrequency: payload.drinkFrequency,
  budgetOption: payload.budgetOption,
  ngFoods: normalizeNgFoods(payload.ngFoods),
  favoriteAreas: normalizeStringArray(payload.favoriteAreas),
  favoritePlaces: normalizeStringArray(payload.favoritePlaces),
  weekdaySlots: toComparableWeekdaySlots(payload.weekdaySlots),
  frequentPlaces: payload.frequentPlaces
    .map((place) => ({
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      photoUrl: place.photoUrl,
    }))
    .sort((a, b) => a.placeId.localeCompare(b.placeId)),
});

const defaultWeekdaySlots: WeekdaySlots = {
  mon: { daytime: false, night: false },
  tue: { daytime: false, night: false },
  wed: { daytime: false, night: false },
  thu: { daytime: false, night: false },
  fri: { daytime: false, night: false },
  sat: { daytime: false, night: false },
  sun: { daytime: false, night: false },
};

const detectBudgetOption = (min?: number | null, max?: number | null): BudgetOptionId => {
  const matched = budgetOptions.find((option) => option.min === (min ?? 0) && option.max === (max ?? null));
  return matched?.id ?? "3000to5000";
};

const toWeekdaySlots = (availability: unknown): WeekdaySlots => {
  if (!availability || typeof availability !== "object") {
    return defaultWeekdaySlots;
  }

  const record = availability as {
    weekdaySlots?: Partial<Record<WeekdayKey, Partial<Slot>>>;
  };

  const slots = record.weekdaySlots;
  if (!slots) {
    return defaultWeekdaySlots;
  }

  const days = Object.keys(defaultWeekdaySlots) as WeekdayKey[];
  return days.reduce((acc, day) => {
    acc[day] = {
      daytime: Boolean(slots[day]?.daytime),
      night: Boolean(slots[day]?.night),
    };
    return acc;
  }, { ...defaultWeekdaySlots });
};

const toFrequentPlaces = (availability: unknown): PlaceResult[] => {
  if (!availability || typeof availability !== "object") {
    return [];
  }

  const record = availability as {
    frequentPlaces?: Array<Partial<PlaceResult>>;
  };

  return (record.frequentPlaces ?? [])
    .flatMap((place) => {
      if (!place.placeId || !place.name || !place.address) {
        return [];
      }
      return [
        {
          placeId: place.placeId,
          name: place.name,
          address: place.address,
          lat: place.lat ?? 0,
          lng: place.lng ?? 0,
          priceLevel: place.priceLevel,
          photoUrl: place.photoUrl,
        },
      ];
    })
    .slice(0, 3);
};

const pickMetadataString = (metadata: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };

    image.src = objectUrl;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to convert image"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });

const toAvatarFileName = (name: string) => {
  const withoutExtension = name.replace(/\.[^/.]+$/u, "").trim();
  return `${withoutExtension || "avatar"}.jpg`;
};

const compressAvatarImage = async (file: File) => {
  const image = await loadImageElement(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available");
  }

  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const initialScale =
    longestEdge > AVATAR_MAX_DIMENSION ? AVATAR_MAX_DIMENSION / longestEdge : 1;

  let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
  let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
  let bestBlob: Blob | null = null;

  const qualitySteps = [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5, 0.44];

  for (let resizeAttempt = 0; resizeAttempt < 7; resizeAttempt += 1) {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of qualitySteps) {
      const blob = await canvasToBlob(canvas, quality);
      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= AVATAR_MAX_UPLOAD_BYTES) {
        return new File([blob], toAvatarFileName(file.name), {
          type: "image/jpeg",
        });
      }
    }

    width = Math.max(1, Math.round(width * 0.85));
    height = Math.max(1, Math.round(height * 0.85));
  }

  if (bestBlob && bestBlob.size <= AVATAR_MAX_UPLOAD_BYTES) {
    return new File([bestBlob], toAvatarFileName(file.name), {
      type: "image/jpeg",
    });
  }

  throw new Error("Could not compress avatar image under 100KB");
};

export default function ProfileSetupPage() {
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarIcon, setAvatarIcon] = useState("");
  const [gender, setGender] = useState("unspecified");
  const [birthDate, setBirthDate] = useState("");
  const [playFrequency, setPlayFrequency] = useState("");
  const [drinkFrequency, setDrinkFrequency] = useState("");
  const [budgetOption, setBudgetOption] = useState<BudgetOptionId>("3000to5000");
  const [ngFoods, setNgFoods] = useState<string[]>([NG_FOOD_NONE_OPTION]);
  const [favoriteAreas, setFavoriteAreas] = useState<string[]>([]);
  const [favoritePlaces, setFavoritePlaces] = useState<string[]>([]);
  const [weekdaySlots, setWeekdaySlots] = useState<WeekdaySlots>(defaultWeekdaySlots);
  const [frequentPlaces, setFrequentPlaces] = useState<PlaceResult[]>([]);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFrequentPlacesOverlayOpen, setIsFrequentPlacesOverlayOpen] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [areaQuery, setAreaQuery] = useState("");
  const [areaResults, setAreaResults] = useState<PlaceResult[]>([]);
  const [isAreaSearching, setIsAreaSearching] = useState(false);
  const [isAreaOverlayOpen, setIsAreaOverlayOpen] = useState(false);
  const [areaMessage, setAreaMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<ProfileStats>(defaultStats);
  const [avatarUploadMessage, setAvatarUploadMessage] = useState<string | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<ProfileFormSnapshot | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUserId = data.session?.user?.id ?? null;
      setUserId(currentUserId);

      const metadata = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
      const metadataDisplayName = metadata
        ? pickMetadataString(metadata, ["display_name", "name", "full_name"])
        : undefined;
      const metadataAvatar = metadata
        ? pickMetadataString(metadata, ["avatar_url", "picture", "profile_image"])
        : undefined;
      const metadataBirthDate = metadata
        ? pickMetadataString(metadata, ["birthdate", "birthday"])
        : undefined;

      const normalizedMetadataBirthDate =
        metadataBirthDate && /^\d{4}-\d{2}-\d{2}$/.test(metadataBirthDate)
          ? metadataBirthDate
          : undefined;

      if (currentUserId) {
        const response = await fetch(
          `/api/profiles/${currentUserId}?viewerId=${encodeURIComponent(currentUserId)}`,
          { cache: "no-store" }
        );
        if (response.ok) {
          const profile = (await response.json()) as ProfileResponse;

          const nextDisplayName = profile.displayName?.trim() || metadataDisplayName || "";
          const nextAvatarIcon = profile.avatarIcon || metadataAvatar || "";
          const nextGender = profile.gender ?? "unspecified";
          const nextBirthDate = profile.birthDate
            ? profile.birthDate.slice(0, 10)
            : normalizedMetadataBirthDate ?? "";
          const nextPlayFrequency = profile.playFrequency ?? "";
          const nextDrinkFrequency = profile.drinkFrequency ?? "";
          const nextBudgetOption = detectBudgetOption(profile.budgetMin, profile.budgetMax);
          const nextNgFoods = normalizeNgFoods(profile.ngFoods ?? []);
          const nextFavoriteAreas = profile.favoriteAreas ?? [];
          const nextFavoritePlaces = profile.favoritePlaces ?? [];
          const nextWeekdaySlots = toWeekdaySlots(profile.availability);
          const nextFrequentPlaces = toFrequentPlaces(profile.availability);

          setDisplayName(nextDisplayName);
          setAvatarIcon(nextAvatarIcon);
          setGender(nextGender);
          setBirthDate(nextBirthDate);
          setPlayFrequency(nextPlayFrequency);
          setDrinkFrequency(nextDrinkFrequency);
          setBudgetOption(nextBudgetOption);
          setNgFoods(nextNgFoods);
          setFavoriteAreas(nextFavoriteAreas);
          setFavoritePlaces(nextFavoritePlaces);
          setWeekdaySlots(nextWeekdaySlots);
          setFrequentPlaces(nextFrequentPlaces);
          setStats(profile.stats ?? defaultStats);

          setInitialSnapshot(
            createProfileSnapshot({
              displayName: nextDisplayName,
              avatarIcon: nextAvatarIcon,
              gender: nextGender,
              birthDate: nextBirthDate,
              playFrequency: nextPlayFrequency,
              drinkFrequency: nextDrinkFrequency,
              budgetOption: nextBudgetOption,
              ngFoods: nextNgFoods,
              favoriteAreas: nextFavoriteAreas,
              favoritePlaces: nextFavoritePlaces,
              weekdaySlots: nextWeekdaySlots,
              frequentPlaces: nextFrequentPlaces,
            })
          );
        } else {
          const nextDisplayName = metadataDisplayName ?? "";
          const nextAvatarIcon = metadataAvatar ?? "";
          const nextBirthDate = normalizedMetadataBirthDate ?? "";

          if (metadataDisplayName) {
            setDisplayName(metadataDisplayName);
          }
          if (metadataAvatar) {
            setAvatarIcon(metadataAvatar);
          }
          if (normalizedMetadataBirthDate) {
            setBirthDate(normalizedMetadataBirthDate);
          }

          setInitialSnapshot(
            createProfileSnapshot({
              displayName: nextDisplayName,
              avatarIcon: nextAvatarIcon,
              gender: "unspecified",
              birthDate: nextBirthDate,
              playFrequency: "",
              drinkFrequency: "",
              budgetOption: "3000to5000",
              ngFoods: [NG_FOOD_NONE_OPTION],
              favoriteAreas: [],
              favoritePlaces: [],
              weekdaySlots: defaultWeekdaySlots,
              frequentPlaces: [],
            })
          );
        }
      }
    };

    loadUser();
  }, [router]);

  const avatarToneClass = useMemo(
    () => getAvatarToneClass(displayName.trim() || userId || "user"),
    [displayName, userId]
  );

  const completionRate = useMemo(() => {
    const localChecks = [
      displayName.trim().length > 0,
      Boolean(birthDate),
      Boolean(playFrequency),
      Boolean(drinkFrequency),
      Boolean(budgetOption),
      ngFoods.length > 0,
      favoriteAreas.length > 0,
      favoritePlaces.length > 0,
      Object.values(weekdaySlots).some((slot) => slot.daytime || slot.night),
    ];
    const done = localChecks.filter(Boolean).length;
    return Math.round((done / localChecks.length) * 100);
  }, [
    birthDate,
    budgetOption,
    displayName,
    drinkFrequency,
    favoriteAreas.length,
    favoritePlaces.length,
    ngFoods.length,
    playFrequency,
    weekdaySlots,
  ]);

  const toggleItem = (setter: Dispatch<SetStateAction<string[]>>, value: string) => {
    setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const toggleNgFood = (value: string) => {
    setNgFoods((prev) => {
      const normalizedPrev = normalizeNgFoods(prev);

      if (value === NG_FOOD_NONE_OPTION) {
        return normalizedPrev.includes(NG_FOOD_NONE_OPTION) ? [NG_FOOD_NONE_OPTION] : [NG_FOOD_NONE_OPTION];
      }

      const withoutNone = normalizedPrev.filter((item) => item !== NG_FOOD_NONE_OPTION);
      if (withoutNone.includes(value)) {
        const next = withoutNone.filter((item) => item !== value);
        return next.length > 0 ? next : [NG_FOOD_NONE_OPTION];
      }

      return [...withoutNone, value];
    });
  };

  const toggleSlot = (day: WeekdayKey, key: keyof Slot) => {
    setWeekdaySlots((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [key]: !prev[day][key],
      },
    }));
  };

  const handleSearchPlaces = async () => {
    if (!placeQuery.trim()) {
      setSearchMessage("店名やエリアを入力して検索してください。");
      return;
    }

    setIsSearching(true);
    setSearchMessage(null);

    const response = await fetch(`/api/places/search?query=${encodeURIComponent(placeQuery)}&limit=6`);
    if (!response.ok) {
      setSearchMessage("検索に失敗しました。時間をおいて再度お試しください。");
      setIsSearching(false);
      return;
    }

    const data = (await response.json()) as { places?: PlaceResult[] };
    setPlaceResults(data.places ?? []);
    setIsSearching(false);
  };

  const addFrequentPlace = (place: PlaceResult) => {
    setFrequentPlaces((prev) => {
      if (prev.some((item) => item.placeId === place.placeId)) {
        setSearchMessage("既に追加済みです。");
        return prev;
      }
      if (prev.length >= 3) {
        setSearchMessage("よく行くお店は最大3件までです。");
        return prev;
      }
      setSearchMessage(null);
      return [...prev, place];
    });
  };

  const removeFrequentPlace = (placeId: string) => {
    setFrequentPlaces((prev) => prev.filter((place) => place.placeId !== placeId));
  };

  const handleSearchAreas = async () => {
    if (!areaQuery.trim()) {
      setAreaMessage("駅名または市区町村名を入力してください。");
      return;
    }

    setIsAreaSearching(true);
    setAreaMessage(null);

    const response = await fetch(
      `/api/places/search?query=${encodeURIComponent(areaQuery)}&kind=area&limit=8`
    );
    if (!response.ok) {
      setAreaMessage("エリア検索に失敗しました。時間をおいて再度お試しください。");
      setIsAreaSearching(false);
      return;
    }

    const data = (await response.json()) as { places?: PlaceResult[] };
    setAreaResults(data.places ?? []);
    setIsAreaSearching(false);
    if ((data.places ?? []).length === 0) {
      setAreaMessage("一致する駅・市区町村が見つかりませんでした。");
    }
  };

  const addFavoriteArea = (area: PlaceResult) => {
    setFavoriteAreas((prev) => {
      if (prev.includes(area.name)) {
        setAreaMessage("既に追加済みです。");
        return prev;
      }
      if (prev.length >= 3) {
        setAreaMessage("よく行くエリアは最大3件までです。");
        return prev;
      }
      setAreaMessage(null);
      return [...prev, area.name];
    });
  };

  const removeFavoriteArea = (areaName: string) => {
    setFavoriteAreas((prev) => prev.filter((area) => area !== areaName));
  };

  const handleSubmit = async () => {
    if (!userId || !displayName) {
      setMessage("ログイン後に表示名を入力してください。");
      return;
    }

    const selectedBudget = budgetOptions.find((option) => option.id === budgetOption) ?? budgetOptions[2];

    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        displayName,
        avatarIcon,
        gender,
        birthDate: birthDate || null,
        playFrequency: playFrequency || null,
        drinkFrequency: drinkFrequency || null,
        budgetMin: selectedBudget.min,
        budgetMax: selectedBudget.max,
        ngFoods,
        favoriteAreas,
        favoritePlaces,
        availability: {
          weekdaySlots,
          frequentPlaces: frequentPlaces.map((place) => ({
            placeId: place.placeId,
            name: place.name,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            photoUrl: place.photoUrl,
          })),
        },
      }),
    });

    if (response.ok) {
      setMessage("更新しました。");
      setAvatarUploadMessage(null);
      setInitialSnapshot(currentSnapshot);
      window.dispatchEvent(new CustomEvent("profile-updated"));
      const refreshed = await fetch(
        `/api/profiles/${userId}?viewerId=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (refreshed.ok) {
        const profile = (await refreshed.json()) as ProfileResponse;
        setStats(profile.stats ?? defaultStats);

        if ((profile.stats?.completionRate ?? 0) >= PROFILE_COMPLETION_THRESHOLD) {
          await supabase.auth.updateUser({
            data: {
              profile_completed: true,
            },
          });
        }
      }
    } else {
      setMessage("更新に失敗しました。");
    }
  };

  const handleAvatarImagePick = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!userId) {
      setAvatarUploadMessage("ログイン後に画像を設定してください。");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAvatarUploadMessage("画像ファイルのみアップロードできます。");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarUploadMessage("画像サイズは5MB以下にしてください。");
      return;
    }

    let uploadFile = file;
    setAvatarUploadMessage("画像を圧縮中...");
    try {
      uploadFile = await compressAvatarImage(file);
    } catch {
      setAvatarUploadMessage("画像を100KB以下に圧縮できませんでした。別の画像をお試しください。");
      return;
    }

    setAvatarUploadMessage("画像をアップロード中...");

    const path = `${userId}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET_NAME)
      .upload(path, uploadFile, {
        cacheControl: "3600",
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      setAvatarUploadMessage("画像アップロードに失敗しました。Storage設定を確認してください。");
      return;
    }

    const { data } = supabase.storage
      .from(AVATAR_BUCKET_NAME)
      .getPublicUrl(path);

    setAvatarIcon(data.publicUrl);
    setAvatarUploadMessage("画像を100KB以下に最適化して設定しました。更新するとプロフィールに反映されます。");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const currentSnapshot = useMemo(
    () =>
      createProfileSnapshot({
        displayName,
        avatarIcon,
        gender,
        birthDate,
        playFrequency,
        drinkFrequency,
        budgetOption,
        ngFoods,
        favoriteAreas,
        favoritePlaces,
        weekdaySlots,
        frequentPlaces,
      }),
    [
      avatarIcon,
      birthDate,
      budgetOption,
      displayName,
      drinkFrequency,
      favoriteAreas,
      favoritePlaces,
      frequentPlaces,
      gender,
      ngFoods,
      playFrequency,
      weekdaySlots,
    ]
  );

  const isProfileChanged = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(currentSnapshot) !== JSON.stringify(initialSnapshot);
  }, [currentSnapshot, initialSnapshot]);

  const fieldChanges = useMemo(() => {
    if (!initialSnapshot) {
      return {
        avatarIcon: false,
        displayName: false,
        birthDate: false,
        gender: false,
        playFrequency: false,
        drinkFrequency: false,
        budgetOption: false,
        ngFoods: false,
        favoriteAreas: false,
        favoritePlaces: false,
        frequentPlaces: false,
        weekdaySlots: false,
      };
    }

    return {
      avatarIcon: currentSnapshot.avatarIcon !== initialSnapshot.avatarIcon,
      displayName: currentSnapshot.displayName !== initialSnapshot.displayName,
      birthDate: currentSnapshot.birthDate !== initialSnapshot.birthDate,
      gender: currentSnapshot.gender !== initialSnapshot.gender,
      playFrequency: currentSnapshot.playFrequency !== initialSnapshot.playFrequency,
      drinkFrequency: currentSnapshot.drinkFrequency !== initialSnapshot.drinkFrequency,
      budgetOption: currentSnapshot.budgetOption !== initialSnapshot.budgetOption,
      ngFoods:
        JSON.stringify(currentSnapshot.ngFoods) !==
        JSON.stringify(initialSnapshot.ngFoods),
      favoriteAreas:
        JSON.stringify(currentSnapshot.favoriteAreas) !==
        JSON.stringify(initialSnapshot.favoriteAreas),
      favoritePlaces:
        JSON.stringify(currentSnapshot.favoritePlaces) !==
        JSON.stringify(initialSnapshot.favoritePlaces),
      frequentPlaces:
        JSON.stringify(currentSnapshot.frequentPlaces) !==
        JSON.stringify(initialSnapshot.frequentPlaces),
      weekdaySlots:
        JSON.stringify(currentSnapshot.weekdaySlots) !==
        JSON.stringify(initialSnapshot.weekdaySlots),
    };
  }, [currentSnapshot, initialSnapshot]);

  return (
    <div className="min-h-screen pb-4">
      <header className="sticky top-0 z-40 border-b border-orange-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-4xl sm:px-6">
          <Link
            href="/"
            aria-label="フィードへ戻る"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
          >
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">プロフィール設定</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6 sm:max-w-4xl sm:px-6">
        <div className="pt-2">
          <div className="rounded-3xl border border-orange-100/70 p-5">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <div
                  className={`grid h-20 w-20 place-items-center overflow-hidden rounded-full text-4xl ${
                    isImageAvatar(avatarIcon) || avatarIcon ? "bg-orange-100" : avatarToneClass
                  }`}
                >
                  {isImageAvatar(avatarIcon) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarIcon}
                      alt="プロフィール画像"
                      className="h-full w-full object-cover"
                    />
                  ) : avatarIcon ? (
                    avatarIcon
                  ) : (
                    <span className="material-symbols-rounded text-[2rem]">person</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-[var(--accent)] text-white shadow-md"
                  aria-label="プロフィール画像を設定"
                >
                  <span className="material-symbols-rounded text-base">photo_camera</span>
                </button>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarImagePick}
                className="hidden"
              />
              <p className="mt-3 text-lg font-semibold text-[var(--foreground)]">
                {displayName || "表示名未設定"}
              </p>
            </div>

            {avatarUploadMessage && (
              <p className="mt-3 text-center text-xs text-[var(--muted)]">{avatarUploadMessage}</p>
            )}
            {fieldChanges.avatarIcon && <UnsavedFieldNotice />}

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <StatCell label="企画" value={stats.hostedCount} />
              <StatCell label="参加" value={stats.participatingCount} />
              <StatCell label="フレンド" value={stats.friendCount} />
            </div>

            <div className="mt-4 rounded-2xl bg-orange-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--muted)]">プロフィール設定状況</p>
                <p className="text-sm font-semibold text-[var(--accent)]">
                  {Math.max(stats.completionRate, completionRate)}%
                </p>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white">
                <div
                  className="h-2 rounded-full bg-[var(--accent)]"
                  style={{ width: `${Math.max(stats.completionRate, completionRate)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <section className="py-4">
              <h2 className="text-sm font-semibold">基本情報</h2>
              <div className="mt-3 grid gap-3">
                <label className="flex flex-col gap-2 text-sm">
                  表示名
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                    placeholder="ニックネーム"
                  />
                  {fieldChanges.displayName && <UnsavedFieldNotice />}
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  生年月日
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                    className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                  />
                  {fieldChanges.birthDate && <UnsavedFieldNotice />}
                </label>
                <ChipRow title="性別" options={genderOptions} selected={gender} onSelect={setGender} />
                {fieldChanges.gender && <UnsavedFieldNotice />}
              </div>
            </section>

            <section className="py-4">
              <h2 className="text-sm font-semibold">ライフスタイル</h2>
              <div className="mt-3 space-y-4">
                <ChipRow title="遊ぶ頻度" options={playFrequencyOptions} selected={playFrequency} onSelect={setPlayFrequency} />
                {fieldChanges.playFrequency && <UnsavedFieldNotice />}
                <ChipRow title="飲む頻度" options={drinkFrequencyOptions} selected={drinkFrequency} onSelect={setDrinkFrequency} />
                {fieldChanges.drinkFrequency && <UnsavedFieldNotice />}
              </div>
            </section>

            <section className="py-4">
              <h2 className="text-sm font-semibold">普段の遊びにかかる費用は？</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {budgetOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setBudgetOption(option.id)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      budgetOption === option.id
                        ? "bg-[var(--accent)] text-white"
                        : "bg-white text-[var(--muted)] shadow-sm"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {fieldChanges.budgetOption && <UnsavedFieldNotice />}
            </section>

            <MultiSelectRow
              title="NG食材"
              options={[...new Set([...defaultNgFoodOptions, ...ngFoods])]} 
              selected={ngFoods}
              onToggle={toggleNgFood}
              addPlaceholder="食材を追加"
              onAddOption={(value) => {
                const normalized = value.trim();
                if (!normalized) return;
                setNgFoods((prev) => {
                  if (normalized === NG_FOOD_NONE_OPTION) {
                    return [NG_FOOD_NONE_OPTION];
                  }

                  const withoutNone = normalizeNgFoods(prev).filter((item) => item !== NG_FOOD_NONE_OPTION);
                  return withoutNone.includes(normalized) ? withoutNone : [...withoutNone, normalized];
                });
              }}
            />
            {fieldChanges.ngFoods && <UnsavedFieldNotice />}

            <section className="py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">よく行くエリア（最大3件）</h2>
                <button
                  onClick={() => setIsAreaOverlayOpen(true)}
                  className={plusButtonClass}
                  aria-label="よく行くエリアを追加"
                >
                  <span className="material-symbols-rounded">add</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Google Places から駅名または市区町村名を選択できます。
              </p>

              {favoriteAreas.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-orange-200 bg-white/80 px-4 py-5 text-center text-xs text-[var(--muted)]">
                  「＋」からエリアを追加してください。
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {favoriteAreas.map((area) => (
                    <div key={area} className="rounded-2xl bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-100 text-[var(--accent)]">
                          <span className="material-symbols-rounded">location_on</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{area}</p>
                          <p className="truncate text-xs text-[var(--muted)]">駅・市区町村</p>
                        </div>
                        <button
                          onClick={() => removeFavoriteArea(area)}
                          className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-500"
                          aria-label={`${area} を削除`}
                        >
                          <span className="material-symbols-rounded text-sm">close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {fieldChanges.favoriteAreas && <UnsavedFieldNotice />}

            <MultiSelectRow
              title="好きなお店ジャンル"
              options={[...new Set(["居酒屋", "イタリアン", "焼肉", "カフェ", "クラフトビール", "和食", "中華", "BAR", ...favoritePlaces])]} 
              selected={favoritePlaces}
              onToggle={(value) => toggleItem(setFavoritePlaces, value)}
              addPlaceholder="ジャンルを追加"
              onAddOption={(value) => {
                setFavoritePlaces((prev) => (prev.includes(value) ? prev : [...prev, value]));
              }}
            />
            {fieldChanges.favoritePlaces && <UnsavedFieldNotice />}

            <section className="py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">よく行くお店（最大3件）</h2>
                <button
                  onClick={() => setIsFrequentPlacesOverlayOpen(true)}
                  className={plusButtonClass}
                  aria-label="よく行くお店を追加"
                >
                  <span className="material-symbols-rounded">add</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">画像・名称・住所で一覧表示されます。</p>

              {frequentPlaces.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-dashed border-orange-200 bg-white/80 px-4 py-5 text-center text-xs text-[var(--muted)]">
                  「＋」からよく行くお店を追加してください。
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {frequentPlaces.map((place) => (
                    <div key={place.placeId} className="rounded-2xl bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <Image
                          src={place.photoUrl ?? "/file.svg"}
                          alt={`${place.name} の写真`}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-xl object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{place.name}</p>
                          <p className="truncate text-xs text-[var(--muted)]">{place.address}</p>
                        </div>
                        <button
                          onClick={() => removeFrequentPlace(place.placeId)}
                          className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-500"
                          aria-label="削除"
                        >
                          <span className="material-symbols-rounded text-sm">close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {fieldChanges.frequentPlaces && <UnsavedFieldNotice />}

            <section className="py-4">
              <h2 className="text-sm font-semibold">遊べる曜日</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">平日・土日それぞれで「日中」「夜」を選べます。</p>
              <div className="mt-3 space-y-3">
                {(Object.keys(dayLabels) as WeekdayKey[]).map((day) => (
                  <div key={day} className="flex items-center justify-between rounded-2xl bg-white px-3 py-3 shadow-sm">
                    <span className="text-sm font-semibold">{dayLabels[day]}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSlot(day, "daytime")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          weekdaySlots[day].daytime
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[#f4f4f3] text-[var(--muted)]"
                        }`}
                      >
                        日中
                      </button>
                      <button
                        onClick={() => toggleSlot(day, "night")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          weekdaySlots[day].night
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[#f4f4f3] text-[var(--muted)]"
                        }`}
                      >
                        夜
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {fieldChanges.weekdaySlots && <UnsavedFieldNotice />}
            </section>
          </div>

          {message && <p className="mt-6 text-sm text-[var(--accent)]">{message}</p>}

          <button
            onClick={handleSubmit}
            disabled={!userId || !isProfileChanged}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="material-symbols-rounded">edit</span>
            更新する
          </button>

          {userId && (
            <button
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--foreground)] shadow-sm"
            >
              <span className="material-symbols-rounded">logout</span>
              ログアウト
            </button>
          )}
        </div>
      </main>

      {isAreaOverlayOpen && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center sm:p-6">
          <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">よく行くエリアを追加</h3>
              <button
                onClick={() => setIsAreaOverlayOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--muted)]"
                aria-label="閉じる"
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={areaQuery}
                  onChange={(event) => setAreaQuery(event.target.value)}
                  placeholder="例: 恵比寿駅 / 渋谷区"
                  className="flex-1 rounded-full bg-white px-4 py-2 text-sm shadow-sm"
                />
                <button
                  onClick={handleSearchAreas}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white sm:w-auto"
                >
                  <span className="material-symbols-rounded">search</span>
                  検索
                </button>
              </div>

              {areaMessage && <p className="text-xs text-[var(--muted)]">{areaMessage}</p>}
              {isAreaSearching && <p className="text-xs text-[var(--muted)]">検索中...</p>}

              {!isAreaSearching && areaResults.length > 0 && (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
                  {areaResults.map((area) => {
                    const selected = favoriteAreas.includes(area.name);
                    return (
                      <li
                        key={area.placeId}
                        className="flex flex-col gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{area.name}</p>
                          <p className="truncate text-xs text-[var(--muted)]">{area.address}</p>
                        </div>
                        <button
                          onClick={() => addFavoriteArea(area)}
                          disabled={selected || favoriteAreas.length >= 3}
                          className="flex w-full items-center justify-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-[var(--accent)] disabled:opacity-50 sm:w-auto"
                        >
                          <span className="material-symbols-rounded">add</span>
                          {selected ? "追加済み" : "追加"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {isFrequentPlacesOverlayOpen && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center sm:p-6">
          <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">よく行くお店を追加</h3>
              <button
                onClick={() => setIsFrequentPlacesOverlayOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--muted)]"
                aria-label="閉じる"
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={placeQuery}
                  onChange={(event) => setPlaceQuery(event.target.value)}
                  placeholder="例: 渋谷 カフェ"
                  className="flex-1 rounded-full bg-white px-4 py-2 text-sm shadow-sm"
                />
                <button
                  onClick={handleSearchPlaces}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white sm:w-auto"
                >
                  <span className="material-symbols-rounded">search</span>
                  検索
                </button>
              </div>

              {searchMessage && <p className="text-xs text-[var(--muted)]">{searchMessage}</p>}
              {isSearching && <p className="text-xs text-[var(--muted)]">検索中...</p>}

              {!isSearching && placeResults.length > 0 && (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">
                  {placeResults.map((place) => {
                    const selected = frequentPlaces.some((item) => item.placeId === place.placeId);
                    return (
                      <li
                        key={place.placeId}
                        className="flex flex-col gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <Image
                            src={place.photoUrl ?? "/file.svg"}
                            alt={`${place.name} の写真`}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded-xl object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--foreground)]">{place.name}</p>
                            <p className="truncate text-xs text-[var(--muted)]">{place.address}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => addFrequentPlace(place)}
                          disabled={selected || frequentPlaces.length >= 3}
                          className="flex w-full items-center justify-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-[var(--accent)] disabled:opacity-50 sm:w-auto"
                        >
                          <span className="material-symbols-rounded">add</span>
                          {selected ? "追加済み" : "追加"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UnsavedFieldNotice() {
  return <p className="mt-2 text-xs font-medium text-[var(--accent)]">{UNSAVED_FIELD_NOTICE}</p>;
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#f7f4ef]/80 px-2 py-3">
      <p className="text-sm font-semibold text-[var(--foreground)]">{value}</p>
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
    </div>
  );
}

type ChipOption = { value: string; label: string };

function ChipRow({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: ChipOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-[var(--foreground)]">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value || "unset"}
            onClick={() => onSelect(option.value)}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              selected === option.value
                ? "bg-[var(--accent)] text-white"
                : "bg-white text-[var(--muted)] shadow-sm"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiSelectRow({
  title,
  options,
  selected,
  onToggle,
  onAddOption,
  addPlaceholder,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onAddOption?: (value: string) => void;
  addPlaceholder?: string;
}) {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [draftValue, setDraftValue] = useState("");

  const handleAdd = () => {
    const normalized = draftValue.trim();
    if (!normalized || !onAddOption) return;
    onAddOption(normalized);
    setDraftValue("");
    setIsOverlayOpen(false);
  };

  return (
    <section className="py-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {onAddOption && addPlaceholder && (
          <button
            onClick={() => setIsOverlayOpen(true)}
            className={plusButtonClass}
            aria-label={`${title}を追加`}
          >
            <span className="material-symbols-rounded">add</span>
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onToggle(option)}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              selected.includes(option)
                ? "bg-[var(--accent)] text-white"
                : "bg-white text-[var(--muted)] shadow-sm"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {isOverlayOpen && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center sm:p-6">
          <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">{title}を追加</h3>
              <button
                onClick={() => setIsOverlayOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--muted)]"
                aria-label="閉じる"
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <input
                value={draftValue}
                onChange={(event) => setDraftValue(event.target.value)}
                placeholder={addPlaceholder}
                className="rounded-full bg-white px-4 py-2 text-sm shadow-sm"
              />
              <button
                onClick={handleAdd}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
              >
                <span className="material-symbols-rounded">add_circle</span>
                追加する
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
