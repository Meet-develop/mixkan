"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase/client";
import { hasAnyWeekdayAvailability } from "@/lib/availability";
import { ProgressBar } from "@/components/features/profile/progress-bar";
import { QuestionCard } from "@/components/features/diagnosis/question-card";
import { ResultCard } from "@/components/features/diagnosis/result-card";
import { DIAGNOSIS_QUESTIONS } from "@/lib/community-diagnosis/questions";
import {
  computeDiagnosis,
  type DiagnosisRating,
  type DiagnosisAnswers,
  type DiagnosisResult,
} from "@/lib/community-diagnosis/scoring";
import { getCommunityType, COMMUNITY_TYPES } from "@/lib/community-diagnosis/types";

// ─── アバター圧縮ユーティリティ ───────────────────────────────────────────────
const AVATAR_BUCKET_NAME = "avatars";
const AVATAR_MAX_UPLOAD_BYTES = 100 * 1024;
const AVATAR_MAX_DIMENSION = 720;

const loadImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Failed to load image")); };
    image.src = objectUrl;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => { blob ? resolve(blob) : reject(new Error("Failed to convert")); },
      "image/jpeg", quality
    );
  });

const compressAvatarImage = async (file: File): Promise<File> => {
  const image = await loadImageElement(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const scale = Math.max(image.naturalWidth, image.naturalHeight, 1) > AVATAR_MAX_DIMENSION
    ? AVATAR_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
    : 1;
  let w = Math.max(1, Math.round(image.naturalWidth * scale));
  let h = Math.max(1, Math.round(image.naturalHeight * scale));
  let best: Blob | null = null;
  for (let attempt = 0; attempt < 7; attempt++) {
    canvas.width = w; canvas.height = h;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
    for (const q of [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.5]) {
      const blob = await canvasToBlob(canvas, q);
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= AVATAR_MAX_UPLOAD_BYTES)
        return new File([blob], file.name.replace(/\.[^/.]+$/u, "") + ".jpg", { type: "image/jpeg" });
    }
    w = Math.max(1, Math.round(w * 0.85));
    h = Math.max(1, Math.round(h * 0.85));
  }
  if (best && best.size <= AVATAR_MAX_UPLOAD_BYTES)
    return new File([best], file.name.replace(/\.[^/.]+$/u, "") + ".jpg", { type: "image/jpeg" });
  throw new Error("Could not compress under 100KB");
};
// ────────────────────────────────────────────────────────────────────────────

// ─── 型定義 ────────────────────────────────────────────────────────────────
type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Slot = { daytime: boolean; night: boolean };
type WeekdaySlots = Record<WeekdayKey, Slot>;

type PlaceResult = {
  placeId: string; name: string; address: string; lat: number; lng: number; photoUrl?: string;
};

type ProfileFieldKey =
  | "avatar" | "displayName" | "gender" | "birthDate"
  | "playFrequency" | "drinkFrequency" | "budget" | "ngFoods"
  | "favoriteAreas" | "favoritePlaces" | "frequentPlaces" | "availability";

// 診断質問 or プロフィール質問の統合ステップ
type Step =
  | { type: "question"; questionIndex: number }
  | { type: "profile"; field: ProfileFieldKey };

type ProfileResponse = {
  displayName?: string | null; avatarIcon?: string | null; gender?: string | null;
  birthDate?: string | null; playFrequency?: string | null; drinkFrequency?: string | null;
  budgetMin?: number | null; budgetMax?: number | null; ngFoods?: string[];
  favoriteAreas?: string[]; favoritePlaces?: string[]; availability?: unknown;
};

type Phase = "loading" | "login" | "intro" | "mixed" | "computing" | "result";
// ────────────────────────────────────────────────────────────────────────────

// ─── 定数 ─────────────────────────────────────────────────────────────────
const genderOptions = [
  { value: "male", label: "男性" }, { value: "female", label: "女性" },
  { value: "other", label: "その他" }, { value: "unspecified", label: "未設定" },
] as const;

const playFrequencyOptions = [
  { value: "low", label: "月1-2回" }, { value: "medium", label: "週1-2回" }, { value: "high", label: "週3回以上" },
] as const;

const drinkFrequencyOptions = [
  { value: "never", label: "飲まない" }, { value: "sometimes", label: "たまに" }, { value: "often", label: "よく飲む" },
] as const;

const budgetOptions = [
  { id: "upto2000", label: "～2000円", min: 0, max: 2000 },
  { id: "2000to3000", label: "2000円～3000円", min: 2000, max: 3000 },
  { id: "3000to5000", label: "3000円～5000円", min: 3000, max: 5000 },
  { id: "5000to10000", label: "5000円～10000円", min: 5000, max: 10000 },
  { id: "over10000", label: "10000円～", min: 10000, max: null as number | null },
] as const;
type BudgetOptionId = (typeof budgetOptions)[number]["id"];

const NG_FOOD_NONE = "なし";
const ngFoodOptions = [NG_FOOD_NONE, "辛いもの", "甲殻類", "乳製品", "パクチー", "生魚", "香草系", "揚げ物", "炭酸"] as const;
const genreOptions = ["居酒屋", "イタリアン", "焼肉", "カフェ", "クラフトビール", "和食", "中華", "BAR"] as const;

const dayLabels: Record<WeekdayKey, string> = { mon:"月", tue:"火", wed:"水", thu:"木", fri:"金", sat:"土", sun:"日" };

const defaultSlots: WeekdaySlots = {
  mon:{daytime:false,night:false}, tue:{daytime:false,night:false}, wed:{daytime:false,night:false},
  thu:{daytime:false,night:false}, fri:{daytime:false,night:false}, sat:{daytime:false,night:false}, sun:{daytime:false,night:false},
};

const profileFieldTitles: Record<ProfileFieldKey, string> = {
  avatar: "プロフィール写真を設定しよう",
  displayName: "名前を教えてください",
  gender: "あなたの性別は？",
  birthDate: "生年月日を教えてください",
  playFrequency: "友達と遊ぶ頻度は？",
  drinkFrequency: "お酒はどのくらい飲みますか？",
  budget: "飲み会1回の予算感は？",
  ngFoods: "苦手な食べ物はありますか？",
  favoriteAreas: "よく行くエリアはどこですか？",
  favoritePlaces: "好きなお店のジャンルは？",
  frequentPlaces: "よく飲みに行くお店を教えてください",
  availability: "集まりやすい曜日・時間帯は？",
};

const chipClass = (selected: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
    selected ? "border-[var(--accent)] bg-orange-50 text-[var(--accent)]" : "border-gray-200 bg-white text-[var(--foreground)]"
  }`;

const isAutoGeneratedName = (name: string | null | undefined) =>
  !name || /^ユーザー[0-9a-f]{4}$/i.test(name);

// LPで見せる代表タイプ
const LP_PREVIEW_CODES = ["BHLO", "SCFD", "BCFO"] as const;

// プロフィール質問を診断質問の間にランダムに混ぜる
const buildMixedSteps = (fields: ProfileFieldKey[]): Step[] => {
  const questionSteps: Step[] = DIAGNOSIS_QUESTIONS.map((_, i) => ({ type: "question", questionIndex: i }));
  if (fields.length === 0) return questionSteps;

  // 最初のステップは必ず診断質問（クイズ感を出す）
  const firstStep = questionSteps[0];
  const pool: Step[] = [...questionSteps.slice(1), ...fields.map((field): Step => ({ type: "profile", field }))];

  // Fisher-Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return [firstStep, ...pool];
};
// ────────────────────────────────────────────────────────────────────────────

export default function CommunityDiagnosisPage() {
  // intro を先に表示し、認証・プロフィール読み込みはバックグラウンドで行う
  const [phase, setPhase] = useState<Phase>("intro");
  const [userId, setUserId] = useState<string | null | undefined>(undefined); // undefined = loading
  const [pendingStart, setPendingStart] = useState(false);
  const [existingAvailability, setExistingAvailability] = useState<unknown>(null);
  const [mixedSteps, setMixedSteps] = useState<Step[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answeredFields, setAnsweredFields] = useState<ProfileFieldKey[]>([]);
  const [answers, setAnswers] = useState<DiagnosisAnswers>({});
  const answersRef = useRef<DiagnosisAnswers>({});
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const submittedRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // プロフィールフィールド状態
  const [avatarIconUrl, setAvatarIconUrl] = useState("");
  const [avatarUploadMessage, setAvatarUploadMessage] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [playFrequency, setPlayFrequency] = useState("");
  const [drinkFrequency, setDrinkFrequency] = useState("");
  const [budgetOption, setBudgetOption] = useState<BudgetOptionId | null>(null);
  const [ngFoods, setNgFoods] = useState<string[]>([]);
  const [favoriteAreas, setFavoriteAreas] = useState<string[]>([]);
  const [areaInput, setAreaInput] = useState("");
  const [favoritePlaces, setFavoritePlaces] = useState<string[]>([]);
  const [frequentPlaces, setFrequentPlaces] = useState<PlaceResult[]>([]);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placeSearchMessage, setPlaceSearchMessage] = useState<string | null>(null);
  const [weekdaySlots, setWeekdaySlots] = useState<WeekdaySlots>(defaultSlots);

  // ─── ロード & ステップ構築 ─────────────────────────────────────────────────
  // バックグラウンドで認証・プロフィールを読み込む（フェーズは変更しない）
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);

      if (!uid) return; // 未ログイン → CTAタップ時に login フェーズへ

      const allFields: ProfileFieldKey[] = [
        "avatar", "displayName", "gender", "birthDate",
        "playFrequency", "drinkFrequency", "budget", "ngFoods",
        "favoriteAreas", "favoritePlaces", "frequentPlaces", "availability",
      ];

      const res = await fetch(`/api/profiles/${uid}?viewerId=${encodeURIComponent(uid)}`, { cache: "no-store" });
      if (!res.ok) {
        setMixedSteps(buildMixedSteps(allFields));
        return;
      }

      const profile = (await res.json()) as ProfileResponse;
      setExistingAvailability(profile.availability ?? null);

      const missing = allFields.filter((field) => {
        switch (field) {
          case "avatar":          return !profile.avatarIcon;
          case "displayName":     return isAutoGeneratedName(profile.displayName);
          case "gender":          return !profile.gender || profile.gender === "unspecified";
          case "birthDate":       return !profile.birthDate;
          case "playFrequency":   return !profile.playFrequency;
          case "drinkFrequency":  return !profile.drinkFrequency;
          case "budget":          return profile.budgetMin == null && profile.budgetMax == null;
          case "ngFoods":         return (profile.ngFoods ?? []).length === 0;
          case "favoriteAreas":   return (profile.favoriteAreas ?? []).length === 0;
          case "favoritePlaces":  return (profile.favoritePlaces ?? []).length === 0;
          case "frequentPlaces": {
            const a = profile.availability as { frequentPlaces?: unknown[] } | null;
            return !a?.frequentPlaces?.length;
          }
          case "availability":    return !hasAnyWeekdayAvailability(profile.availability);
        }
      });

      setMixedSteps(buildMixedSteps(missing));
    };
    load();
  }, []);

  // pendingStart: CTAタップ時にまだロード中だった場合、完了後に開始する
  useEffect(() => {
    if (!pendingStart || userId === undefined) return;
    setPendingStart(false);
    if (userId === null) { setPhase("login"); return; }
    if (mixedSteps.length === 0) {
      // プロフィールAPIがまだ返っていない場合は全フィールドで開始
      const allFields: ProfileFieldKey[] = [
        "avatar", "displayName", "gender", "birthDate",
        "playFrequency", "drinkFrequency", "budget", "ngFoods",
        "favoriteAreas", "favoritePlaces", "frequentPlaces", "availability",
      ];
      setMixedSteps(buildMixedSteps(allFields));
    }
    setPhase("mixed");
  }, [pendingStart, userId, mixedSteps.length]);

  // ─── ステップ管理 ──────────────────────────────────────────────────────────
  const totalSteps = mixedSteps.length;
  const currentStep = mixedSteps[currentStepIndex];
  const currentProfileField = currentStep?.type === "profile" ? currentStep.field : undefined;

  const isProfileFieldAnswered = useMemo(() => {
    switch (currentProfileField) {
      case "avatar":          return avatarIconUrl.length > 0;
      case "displayName":     return displayName.trim().length > 0;
      case "gender":          return gender.length > 0;
      case "birthDate":       return birthDate.length > 0;
      case "playFrequency":   return playFrequency.length > 0;
      case "drinkFrequency":  return drinkFrequency.length > 0;
      case "budget":          return budgetOption != null;
      case "ngFoods":         return ngFoods.length > 0;
      case "favoriteAreas":   return favoriteAreas.length > 0;
      case "favoritePlaces":  return favoritePlaces.length > 0;
      case "frequentPlaces":  return frequentPlaces.length > 0;
      case "availability":    return Object.values(weekdaySlots).some((s) => s.daytime || s.night);
      default:                return false;
    }
  }, [
    currentProfileField, avatarIconUrl, displayName, gender, birthDate,
    playFrequency, drinkFrequency, budgetOption,
    ngFoods.length, favoriteAreas.length, favoritePlaces.length, frequentPlaces.length, weekdaySlots,
  ]);

  const finishMixedFlow = useCallback((finalAnswers: DiagnosisAnswers) => {
    try {
      setResult(computeDiagnosis(finalAnswers));
      setPhase("computing");
    } catch {
      // 回答不足の場合はそのまま
    }
  }, []);

  const advanceStep = useCallback((latestAnswers?: DiagnosisAnswers) => {
    // プロフィール回答の記録
    if (currentStep?.type === "profile" && currentProfileField && isProfileFieldAnswered) {
      setAnsweredFields((prev) => prev.includes(currentProfileField) ? prev : [...prev, currentProfileField]);
    }
    const next = currentStepIndex + 1;
    if (next < mixedSteps.length) {
      setCurrentStepIndex(next);
    } else {
      finishMixedFlow(latestAnswers ?? answersRef.current);
    }
  }, [currentStep, currentProfileField, isProfileFieldAnswered, currentStepIndex, mixedSteps.length, finishMixedFlow]);

  const handleDiagnosisAnswer = useCallback((rating: DiagnosisRating) => {
    if (!currentStep || currentStep.type !== "question") return;
    const question = DIAGNOSIS_QUESTIONS[currentStep.questionIndex];
    const next = { ...answersRef.current, [question.id]: rating };
    answersRef.current = next;
    setAnswers(next);
    advanceStep(next);
  }, [currentStep, advanceStep]);

  useEffect(() => {
    if (phase !== "computing") return;
    const t = setTimeout(() => setPhase("result"), 1800);
    return () => clearTimeout(t);
  }, [phase]);

  // ─── 保存 ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "result" || !result || !userId || submittedRef.current) return;
    submittedRef.current = true;

    const save = async () => {
      setSaveState("saving");
      const profileUpdates: Record<string, unknown> = {};

      for (const field of answeredFields) {
        switch (field) {
          case "avatar":        profileUpdates.avatarIcon = avatarIconUrl; break;
          case "displayName":   profileUpdates.displayName = displayName.trim(); break;
          case "gender":        profileUpdates.gender = gender; break;
          case "birthDate":     profileUpdates.birthDate = birthDate; break;
          case "playFrequency": profileUpdates.playFrequency = playFrequency; break;
          case "drinkFrequency":profileUpdates.drinkFrequency = drinkFrequency; break;
          case "budget": {
            const o = budgetOptions.find((b) => b.id === budgetOption);
            if (o) { profileUpdates.budgetMin = o.min; profileUpdates.budgetMax = o.max; }
            break;
          }
          case "ngFoods":       profileUpdates.ngFoods = ngFoods; break;
          case "favoriteAreas": profileUpdates.favoriteAreas = favoriteAreas; break;
          case "favoritePlaces":profileUpdates.favoritePlaces = favoritePlaces; break;
        }
      }

      const needsAvailability = answeredFields.includes("availability") || answeredFields.includes("frequentPlaces");
      if (needsAvailability) {
        const base = existingAvailability && typeof existingAvailability === "object"
          ? { ...(existingAvailability as Record<string, unknown>) } : {};
        if (answeredFields.includes("availability")) base.weekdaySlots = weekdaySlots;
        if (answeredFields.includes("frequentPlaces"))
          base.frequentPlaces = frequentPlaces.map((p) => ({
            placeId: p.placeId, name: p.name, address: p.address, lat: p.lat, lng: p.lng, photoUrl: p.photoUrl,
          }));
        profileUpdates.availability = base;
      }

      const r = await fetch("/api/profiles/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, communityType: result.code, axisScores: result.axisScores, profileUpdates }),
      });
      setSaveState(r.ok ? "saved" : "error");
    };

    save();
  }, [
    phase, result, userId, answeredFields, avatarIconUrl, displayName, gender, birthDate,
    playFrequency, drinkFrequency, budgetOption, ngFoods, favoriteAreas, favoritePlaces,
    frequentPlaces, weekdaySlots, existingAvailability,
  ]);

  const restartQuestions = () => {
    submittedRef.current = false;
    answersRef.current = {};
    setAnswers({});
    setAnsweredFields([]);
    setCurrentStepIndex(0);
    // ステップを再シャッフル
    const allFields: ProfileFieldKey[] = [
      "avatar", "displayName", "gender", "birthDate",
      "playFrequency", "drinkFrequency", "budget", "ngFoods",
      "favoriteAreas", "favoritePlaces", "frequentPlaces", "availability",
    ];
    setMixedSteps(buildMixedSteps(allFields));
    setResult(null);
    setSaveState("idle");
    setPhase("mixed");
  };

  // ─── ハンドラ ──────────────────────────────────────────────────────────────
  const handleAvatarPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) { setAvatarUploadMessage("画像ファイルを選んでください。"); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarUploadMessage("5MB以下の画像を選んでください。"); return; }

    setIsUploadingAvatar(true);
    setAvatarUploadMessage("アップロード中...");
    let uploadFile = file;
    try { uploadFile = await compressAvatarImage(file); }
    catch { setAvatarUploadMessage("圧縮に失敗しました。別の画像をお試しください。"); setIsUploadingAvatar(false); return; }

    const path = `${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from(AVATAR_BUCKET_NAME)
      .upload(path, uploadFile, { cacheControl: "3600", contentType: "image/jpeg", upsert: true });
    if (error) { setAvatarUploadMessage("アップロードに失敗しました。"); setIsUploadingAvatar(false); return; }

    const { data } = supabase.storage.from(AVATAR_BUCKET_NAME).getPublicUrl(path);
    setAvatarIconUrl(data.publicUrl);
    setAvatarUploadMessage(null);
    setIsUploadingAvatar(false);
  };

  const toggleNgFood = (v: string) => setNgFoods((prev) => {
    if (v === NG_FOOD_NONE) return prev.includes(NG_FOOD_NONE) ? [] : [NG_FOOD_NONE];
    const without = prev.filter((x) => x !== NG_FOOD_NONE);
    return without.includes(v) ? without.filter((x) => x !== v) : [...without, v];
  });

  const addFavoriteArea = () => {
    const v = areaInput.trim();
    if (!v || favoriteAreas.includes(v) || favoriteAreas.length >= 3) return;
    setFavoriteAreas((p) => [...p, v]);
    setAreaInput("");
  };

  const toggleSlot = (day: WeekdayKey, key: keyof Slot) =>
    setWeekdaySlots((p) => ({ ...p, [day]: { ...p[day], [key]: !p[day][key] } }));

  const handleSearchPlaces = async () => {
    if (!placeQuery.trim()) { setPlaceSearchMessage("店名や駅名で検索してください。"); return; }
    setIsSearchingPlaces(true); setPlaceSearchMessage(null);
    const r = await fetch(`/api/places/search?query=${encodeURIComponent(placeQuery)}&limit=6`);
    if (!r.ok) { setPlaceSearchMessage("検索に失敗しました。時間をおいて再度お試しください。"); setIsSearchingPlaces(false); return; }
    const data = (await r.json()) as { places?: PlaceResult[] };
    setPlaceResults(data.places ?? []);
    setIsSearchingPlaces(false);
  };

  const addFrequentPlace = (p: PlaceResult) => setFrequentPlaces((prev) => {
    if (prev.some((x) => x.placeId === p.placeId)) { setPlaceSearchMessage("既に追加済みです。"); return prev; }
    if (prev.length >= 3) { setPlaceSearchMessage("最大3件までです。"); return prev; }
    setPlaceSearchMessage(null);
    return [...prev, p];
  });

  const resultType = result ? getCommunityType(result.code) : null;

  // ─── プロフィールフィールドUI ──────────────────────────────────────────────
  const renderProfileField = (field: ProfileFieldKey) => {
    switch (field) {
      case "avatar":
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              {avatarIconUrl
                ? <img src={avatarIconUrl} alt="プロフィール写真" className="h-24 w-24 rounded-full object-cover shadow-sm" /> // eslint-disable-line @next/next/no-img-element
                : <div className="grid h-24 w-24 place-items-center rounded-full bg-orange-50 text-4xl shadow-sm">👤</div>
              }
              {isUploadingAvatar && (
                <div className="absolute inset-0 grid place-items-center rounded-full bg-white/70">
                  <span className="text-xs text-[var(--muted)]">...</span>
                </div>
              )}
            </div>
            {avatarUploadMessage && <p className="text-center text-xs text-[var(--muted)]">{avatarUploadMessage}</p>}
            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={isUploadingAvatar}
              className="rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-semibold text-[var(--accent)] disabled:opacity-50">
              {avatarIconUrl ? "写真を変える" : "写真を選ぶ"}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarPick} />
          </div>
        );
      case "displayName":
        return (
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例: タナカ ケン" maxLength={30}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm" />
        );
      case "gender":
        return (
          <div className="flex flex-wrap gap-2">
            {genderOptions.map((o) => (
              <button key={o.value} type="button" onClick={() => setGender(o.value)} className={chipClass(gender === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        );
      case "birthDate":
        return (
          <input type="date" value={birthDate} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setBirthDate(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm" />
        );
      case "playFrequency":
        return (
          <div className="flex flex-wrap gap-2">
            {playFrequencyOptions.map((o) => (
              <button key={o.value} type="button" onClick={() => setPlayFrequency(o.value)} className={chipClass(playFrequency === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        );
      case "drinkFrequency":
        return (
          <div className="flex flex-wrap gap-2">
            {drinkFrequencyOptions.map((o) => (
              <button key={o.value} type="button" onClick={() => setDrinkFrequency(o.value)} className={chipClass(drinkFrequency === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        );
      case "budget":
        return (
          <div className="flex flex-wrap gap-2">
            {budgetOptions.map((o) => (
              <button key={o.id} type="button" onClick={() => setBudgetOption(o.id)} className={chipClass(budgetOption === o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        );
      case "ngFoods":
        return (
          <div className="flex flex-wrap gap-2">
            {ngFoodOptions.map((o) => (
              <button key={o} type="button" onClick={() => toggleNgFood(o)} className={chipClass(ngFoods.includes(o))}>
                {o}
              </button>
            ))}
          </div>
        );
      case "favoriteAreas":
        return (
          <div>
            <div className="flex gap-2">
              <input type="text" value={areaInput} onChange={(e) => setAreaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFavoriteArea(); } }}
                placeholder="例: 新宿、梅田（駅名・地名）"
                className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm" />
              <button type="button" onClick={addFavoriteArea}
                className="rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">
                追加
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {favoriteAreas.map((a) => (
                <button key={a} type="button" onClick={() => setFavoriteAreas((p) => p.filter((x) => x !== a))}
                  className={chipClass(true)}>{a} ✕
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)]">最大3つまで · 駅名や地名で入力してください</p>
          </div>
        );
      case "favoritePlaces":
        return (
          <div className="flex flex-wrap gap-2">
            {genreOptions.map((g) => (
              <button key={g} type="button"
                onClick={() => setFavoritePlaces((p) => p.includes(g) ? p.filter((x) => x !== g) : [...p, g])}
                className={chipClass(favoritePlaces.includes(g))}>
                {g}
              </button>
            ))}
          </div>
        );
      case "frequentPlaces":
        return (
          <div>
            <div className="flex gap-2">
              <input type="text" value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearchPlaces(); } }}
                placeholder="例: 新宿駅　○○居酒屋"
                className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm" />
              <button type="button" onClick={handleSearchPlaces} disabled={isSearchingPlaces}
                className="rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {isSearchingPlaces ? "検索中" : "検索"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--muted)]">地名＋店名で検索してください（例: 渋谷 バー、梅田 焼肉）</p>
            {placeSearchMessage && <p className="mt-1.5 text-xs text-[var(--muted)]">{placeSearchMessage}</p>}
            {placeResults.length > 0 && (
              <div className="mt-3 space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-2">
                {placeResults.map((p) => (
                  <div key={p.placeId} className="flex items-center gap-2 rounded-xl bg-white p-2">
                    {p.photoUrl
                      ? <img src={p.photoUrl} alt={p.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" /> // eslint-disable-line @next/next/no-img-element
                      : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-orange-50 text-lg">🍺</div>
                    }
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{p.name}</p>
                      <p className="truncate text-[10px] text-[var(--muted)]">{p.address}</p>
                    </div>
                    <button type="button" onClick={() => addFrequentPlace(p)}
                      disabled={frequentPlaces.some((x) => x.placeId === p.placeId) || frequentPlaces.length >= 3}
                      className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">
                      追加
                    </button>
                  </div>
                ))}
              </div>
            )}
            {frequentPlaces.length > 0 && (
              <div className="mt-3 space-y-2">
                {frequentPlaces.map((p) => (
                  <div key={p.placeId} className="flex items-center gap-2 rounded-xl border border-orange-100 bg-white p-2">
                    {p.photoUrl
                      ? <img src={p.photoUrl} alt={p.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" /> // eslint-disable-line @next/next/no-img-element
                      : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-orange-50 text-lg">🍺</div>
                    }
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{p.name}</p>
                      <p className="truncate text-[10px] text-[var(--muted)]">{p.address}</p>
                    </div>
                    <button type="button"
                      onClick={() => setFrequentPlaces((prev) => prev.filter((x) => x.placeId !== p.placeId))}
                      className="shrink-0 rounded-full border border-gray-200 px-2 py-1 text-[10px] font-semibold text-[var(--muted)]">
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-[var(--muted)]">最大3件まで登録できます</p>
          </div>
        );
      case "availability":
        return (
          <div className="space-y-2">
            {(Object.keys(dayLabels) as WeekdayKey[]).map((day) => (
              <div key={day} className="flex items-center gap-2">
                <span className="w-8 text-xs font-semibold text-[var(--muted)]">{dayLabels[day]}</span>
                <button type="button" onClick={() => toggleSlot(day, "daytime")} className={`flex-1 ${chipClass(weekdaySlots[day].daytime)}`}>昼</button>
                <button type="button" onClick={() => toggleSlot(day, "night")} className={`flex-1 ${chipClass(weekdaySlots[day].night)}`}>夜</button>
              </div>
            ))}
          </div>
        );
    }
  };

  // ─── LP イントロ ────────────────────────────────────────────────────────────
  const renderIntro = () => (
    <div className="space-y-10 pb-8">
      {/* Hero */}
      <div className="pt-4 text-center">
        <motion.p
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "backOut" }}
          className="text-6xl"
        >
          🍻
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          <h2 className="mt-5 text-2xl font-black leading-tight text-[var(--foreground)]">
            飲み会で
            <span className="text-[var(--accent)]">「これ私じゃん」</span>
            <br />
            が見つかる
          </h2>
          <h3 className="mt-1 text-xl font-black text-[var(--foreground)]">コミュニティ属性診断</h3>
          <p className="mt-3 text-sm leading-relaxed text-[var(--foreground)]/70">
            4つの軸から、あなたが一番心地よくいられる<br />コミュニティのタイプを16種類に分類します
          </p>
        </motion.div>
      </div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        className="flex justify-center gap-8"
      >
        {[
          { num: "16", label: "タイプ" },
          { num: "4", label: "診断軸" },
          { num: "約3分", label: "で完了" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-2xl font-black text-[var(--accent)]">{s.num}</p>
            <p className="text-[11px] text-[var(--muted)]">{s.label}</p>
          </div>
        ))}
      </motion.div>

      {/* Type examples */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <p className="mb-3 text-center text-xs font-bold text-[var(--muted)]">— タイプ例 —</p>
        <div className="space-y-2.5">
          {LP_PREVIEW_CODES.map((code) => {
            const t = getCommunityType(code);
            if (!t) return null;
            return (
              <div
                key={code}
                className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm"
                style={{ borderLeft: `4px solid ${t.themeColor}` }}
              >
                <div>
                  <p className="text-sm font-black text-[var(--foreground)]">{t.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--foreground)]/60">{t.tagline}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-[var(--muted)]">…ほか13タイプ。あなたはどれ？</p>
      </motion.div>

      {/* 4 axes */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="rounded-2xl bg-orange-50/60 px-5 py-4"
      >
        <p className="mb-3 text-center text-xs font-bold text-[var(--accent)]">診断する4つの軸</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "人数", desc: "大人数ワイワイ vs 少人数しっぽり" },
            { label: "場の雰囲気", desc: "にぎやか vs 落ち着き" },
            { label: "関わり方", desc: "企画・リード vs 参加・フォロー" },
            { label: "つながり方", desc: "広く浅く vs 狭く深く" },
          ].map((axis) => (
            <div key={axis.label} className="rounded-xl bg-white px-3 py-2.5">
              <p className="text-xs font-bold text-[var(--foreground)]">{axis.label}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-[var(--muted)]">{axis.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.4 }}
        className="text-center"
      >
        <button
          type="button"
          onClick={() => {
            if (userId === undefined) {
              // まだロード中 → 完了後に自動スタート
              setPendingStart(true);
              setPhase("loading");
              return;
            }
            if (userId === null) { setPhase("login"); return; }
            setPhase("mixed");
          }}
          className="w-full rounded-full bg-[var(--accent)] px-6 py-4 text-base font-black text-white shadow-lg transition active:scale-[0.98]"
        >
          無料で診断する →
        </button>
        <p className="mt-2 text-[11px] text-[var(--muted)]">結果はプロフィールに自動保存されます</p>
      </motion.div>

      {/* All types link */}
      <div className="text-center">
        <Link href="/diagnosis/types/bhlo" className="text-xs text-[var(--accent)] underline underline-offset-2">
          全16タイプを先に見る
        </Link>
      </div>
    </div>
  );

  // ─── 混合ステップUI ────────────────────────────────────────────────────────
  const renderMixedStep = () => {
    if (!currentStep) return null;

    if (currentStep.type === "question") {
      return (
        <QuestionCard
          key={`q-${currentStep.questionIndex}`}
          question={DIAGNOSIS_QUESTIONS[currentStep.questionIndex]}
          questionNumber={currentStep.questionIndex + 1}
          totalQuestions={12}
          onAnswer={handleDiagnosisAnswer}
        />
      );
    }

    // プロフィールステップ（クイズカードと同一スタイル）
    const field = currentStep.field;
    return (
      <motion.div
        key={`p-${field}`}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-bold text-[var(--foreground)]">{profileFieldTitles[field]}</h2>
        <div className="mt-5">{renderProfileField(field)}</div>
        <button
          type="button"
          onClick={() => advanceStep()}
          disabled={isUploadingAvatar}
          className="mt-6 w-full rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-40"
        >
          次へ
        </button>
      </motion.div>
    );
  };

  // ─── レンダリング ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-orange-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-4xl sm:px-6">
          <Link href="/" aria-label="ホームへ戻る"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm">
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">コミュニティ属性診断</h1>
        </div>
      </header>

      {phase === "mixed" && (
        <ProgressBar
          progress={totalSteps > 0 ? (currentStepIndex / totalSteps) * 100 : 0}
          currentStep={currentStepIndex + 1}
          totalSteps={totalSteps}
        />
      )}

      <main className="mx-auto max-w-md px-4 py-8 sm:px-6">
        {phase === "loading" && (
          <p className="py-20 text-center text-sm text-[var(--muted)]">読み込み中...</p>
        )}

        {phase === "login" && (
          <div className="py-20 text-center">
            <p className="text-sm text-[var(--muted)]">診断を始めるにはログインが必要です。</p>
            <Link href="/login"
              className="mt-4 inline-block rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white">
              ログインする
            </Link>
          </div>
        )}

        {phase === "intro" && renderIntro()}

        {phase === "mixed" && (
          <AnimatePresence mode="wait">
            {renderMixedStep()}
          </AnimatePresence>
        )}

        {phase === "computing" && (
          <div className="py-20 text-center">
            <motion.p
              animate={{ rotate: [0, 12, -12, 0] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-5xl"
            >
              🔮
            </motion.p>
            <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">あなたのタイプを分析中...</p>
          </div>
        )}

        {phase === "result" && result && resultType && (
          <div>
            <p className="text-center text-sm font-bold text-[var(--accent)]">あなたのコミュニティ属性は…</p>
            <div className="mt-4">
              <ResultCard type={resultType} axisScores={result.axisScores} />
            </div>
            <p className="mt-3 text-center text-xs text-[var(--muted)]">
              {saveState === "saving" && "プロフィールに保存中..."}
              {saveState === "saved" && "診断結果をプロフィールに登録しました ✔"}
              {saveState === "error" && "保存に失敗しました。時間をおいて再度お試しください。"}
            </p>
            <div className="mt-5 space-y-3">
              <Link href="/profile/setup"
                className="block w-full rounded-full bg-[var(--accent)] px-6 py-3.5 text-center text-sm font-bold text-white shadow-md">
                プロフィールを見る
              </Link>
              <button type="button" onClick={restartQuestions}
                className="block w-full rounded-full border border-orange-200 bg-white px-6 py-3 text-center text-sm font-semibold text-[var(--accent)]">
                もう一度診断する
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
