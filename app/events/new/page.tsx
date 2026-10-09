"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getAvatarToneClass, isImageAvatar } from "@/components/ui/avatar-name";
import { markFeedRefreshNeeded } from "@/lib/feed-refresh";
import { toIsoUtcStringFromLocalDateTime } from "@/lib/datetime";

type Friend = {
  userId: string;
  displayName: string;
  avatarIcon?: string | null;
  area?: string | null;
  isFavorite?: boolean;
};

type PlaceResult = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  priceLevel?: number;
  photoUrl?: string;
};

type ProfileResponse = {
  favoriteAreas?: string[];
  stats?: {
    completionRate?: number;
  };
};

type EventEditResponse = {
  id: string;
  purpose: string;
  comment?: string | null;
  area?: string | null;
  visibility: "public" | "limited" | "private";
  capacity: number;
  fixedStartTime?: string | null;
  fixedPlaceId?: string | null;
  fixedPlaceName?: string | null;
  fixedPlaceAddress?: string | null;
  owner: {
    userId: string;
  };
  timeCandidates: { startTime: string; endTime: string }[];
  placeCandidates: PlaceResult[];
};

type EventUpdateComparable = {
  purpose: string;
  comment: string;
  eventArea: string;
  visibility: "public" | "limited" | "private";
  capacity: number;
  timeSetting: "auto" | "candidates" | "manual";
  placeSetting: "auto" | "manual";
  fixedStartTime: string | null;
  candidateStartTimes: string;
  fixedPlace: {
    placeId: string;
    name: string;
    address: string;
  } | null;
};

type TimeCandidate = {
  id: string;
  startTime: string;
  endTime: string;
};

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const visibilityOptions: Array<{
  value: "public" | "limited" | "private";
  label: string;
  icon: string;
}> = [
  { value: "public", label: "公開イベント", icon: "public" },
  { value: "limited", label: "限定公開", icon: "group" },
  { value: "private", label: "プライベート", icon: "lock" },
];

const purposeElementOptions = [
  "飲み",
  "ごはん",
  "カフェ",
  "カラオケ",
  "映画",
  "ボドゲ",
  "スポーツ",
  "散歩",
  "ランチ",
  "ディナー",
  "初めまして歓迎",
  "少人数",
];

const timeSettingOptions: Array<{
  value: "auto" | "candidates" | "manual";
  label: string;
  caption: string;
  recommended?: boolean;
}> = [
  { value: "auto", label: "おまかせ", caption: "直近の日程を自動で提案", recommended: true },
  { value: "candidates", label: "日程候補を設定する", caption: "日程の選択肢を手動で追加" },
  { value: "manual", label: "固定", caption: "既に確定している日程を設定" },
];

const placeSettingOptions: Array<{
  value: "auto" | "manual";
  label: string;
  caption: string;
  recommended?: boolean;
}> = [
  { value: "auto", label: "おまかせ", caption: "候補を自動提案", recommended: true },
  { value: "manual", label: "設定する", caption: "自分で確定" },
];

const plusButtonClass =
  "grid h-7 w-7 place-items-center rounded-full border border-dashed border-gray-400 bg-gray-50 text-gray-500";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const formatCandidateStart = (isoString: string) => {
  const jst = new Date(new Date(isoString).getTime() + JST_OFFSET_MS);
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const weekday = WEEKDAY_LABELS[jst.getUTCDay()];
  const h = String(jst.getUTCHours()).padStart(2, "0");
  const m = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${month}月${day}日 (${weekday}) ${h}:${m}〜`;
};

const generateId = () => Math.random().toString(36).slice(2);

const buildAutoTitle = (elements: string[]) => {
  if (elements.length === 0) return "";
  if (elements.length === 1) return `${elements[0]}会`;
  return `${elements.slice(0, 2).join(" × ")}の会`;
};

const scrollToCenter = (target: HTMLElement | null) => {
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
};

const normalizeArea = (area?: string | null) => {
  if (!area) return "";
  return area.trim().replace(/(駅|市|区|町|村)$/u, "");
};

const normalizeCapacity = (value: number) => {
  if (!Number.isFinite(value)) return 2;
  return Math.max(2, Math.floor(value));
};

const toDatetimeLocalValue = (dateLike?: string | null) => {
  if (!dateLike) return "";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (value: number) => `${value}`.padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toComparableText = (value?: string | null) => (value ?? "").trim();

const serializeComparable = (value: EventUpdateComparable) => JSON.stringify(value);

const buildComparableFromEvent = (event: EventEditResponse): EventUpdateComparable => {
  const hasFixedStart = Boolean(event.fixedStartTime);
  const hasFixedPlace = Boolean(
    event.fixedPlaceId && event.fixedPlaceName && event.fixedPlaceAddress
  );
  const resolvedTimeSetting: "auto" | "candidates" | "manual" = hasFixedStart
    ? "manual"
    : event.timeCandidates.length > 0
      ? "candidates"
      : "auto";

  return {
    purpose: toComparableText(event.purpose),
    comment: toComparableText(event.comment),
    eventArea: toComparableText(event.area),
    visibility: event.visibility,
    capacity: normalizeCapacity(event.capacity),
    timeSetting: resolvedTimeSetting,
    placeSetting: hasFixedPlace ? "manual" : "auto",
    fixedStartTime: hasFixedStart ? toDatetimeLocalValue(event.fixedStartTime) : null,
    candidateStartTimes: [...event.timeCandidates.map((c) => c.startTime)].sort().join(","),
    fixedPlace: hasFixedPlace
      ? {
          placeId: toComparableText(event.fixedPlaceId),
          name: toComparableText(event.fixedPlaceName),
          address: toComparableText(event.fixedPlaceAddress),
        }
      : null,
  };
};

export default function EventCreatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen pb-4" />}>
      <EventCreatePageContent />
    </Suspense>
  );
}

function EventCreatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editEventId = searchParams.get("editEventId");
  const isEditMode = Boolean(editEventId);
  const [userId, setUserId] = useState<string | null>(null);
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [initialEditComparable, setInitialEditComparable] = useState<string | null>(null);

  const [purposeElements, setPurposeElements] = useState<string[]>([]);
  const [customPurposeOptions, setCustomPurposeOptions] = useState<string[]>([]);
  const [customPurposeInput, setCustomPurposeInput] = useState("");
  const [showAddPurposeInput, setShowAddPurposeInput] = useState(false);
  const [purposeMessage, setPurposeMessage] = useState<string | null>(null);

  const [eventTitleInput, setEventTitleInput] = useState("");
  const [isTitleCustomized, setIsTitleCustomized] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "limited" | "private">("public");
  const [capacity, setCapacity] = useState(6);
  const [selectedInvites, setSelectedInvites] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);

  const [profileFavoriteAreas, setProfileFavoriteAreas] = useState<string[]>([]);
  const [profileCompletionRate, setProfileCompletionRate] = useState<number>(0);
  const [eventAreaOptions, setEventAreaOptions] = useState<string[]>([]);
  const [selectedEventArea, setSelectedEventArea] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [areaResults, setAreaResults] = useState<PlaceResult[]>([]);
  const [isAreaSearching, setIsAreaSearching] = useState(false);
  const [isAreaOverlayOpen, setIsAreaOverlayOpen] = useState(false);
  const [areaMessage, setAreaMessage] = useState<string | null>(null);

  const [timeSetting, setTimeSetting] = useState<"auto" | "candidates" | "manual">("auto");
  const [placeSetting, setPlaceSetting] = useState<"auto" | "manual">("auto");
  const [fixedStart, setFixedStart] = useState("");
  const [activeCandidates, setActiveCandidates] = useState<TimeCandidate[]>([]);
  const [suggestionPool, setSuggestionPool] = useState<TimeCandidate[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isSuggestionsError, setIsSuggestionsError] = useState(false);
  const [suggestionRetryCount, setSuggestionRetryCount] = useState(0);
  const [manualDateInput, setManualDateInput] = useState("");
  const [showManualDateInput, setShowManualDateInput] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [candidatePlaces, setCandidatePlaces] = useState<PlaceResult[]>([]);
  const [eventComment, setEventComment] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  const [visibilityTouched, setVisibilityTouched] = useState(true);
  const [capacityTouched, setCapacityTouched] = useState(true);
  const [areaStepDone, setAreaStepDone] = useState(false);
  const [friendStepDone, setFriendStepDone] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [activeStep, setActiveStep] = useState<Step>(1);
  const [isFocusMode, setIsFocusMode] = useState(() => !isEditMode);

  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const hasFetchedSuggestionsRef = useRef(false);

  const purposeSectionRef = useRef<HTMLElement | null>(null);
  const visibilitySectionRef = useRef<HTMLElement | null>(null);
  const capacitySectionRef = useRef<HTMLElement | null>(null);
  const areaSectionRef = useRef<HTMLElement | null>(null);
  const friendSectionRef = useRef<HTMLElement | null>(null);
  const submitSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUserId = data.session?.user?.id ?? null;
      setUserId(currentUserId);

      if (!currentUserId) return;
      const profileResponse = await fetch(
        `/api/profiles/${currentUserId}?viewerId=${encodeURIComponent(currentUserId)}`,
        { cache: "no-store" }
      );
      if (profileResponse.ok) {
        const profile = (await profileResponse.json()) as ProfileResponse;
        const areas = (profile.favoriteAreas ?? []).slice(0, 3);
        setProfileFavoriteAreas(areas);
        setProfileCompletionRate(profile.stats?.completionRate ?? 0);
        setEventAreaOptions(areas);
        if (areas.length > 0) {
          setSelectedEventArea((prev) => prev || areas[0]);
        }
      } else {
        setProfileCompletionRate(0);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!isEditMode || !editEventId || !userId) {
      return;
    }

    let active = true;

    const loadEventForEdit = async () => {
      setIsEditLoading(true);
      const response = await fetch(
        `/api/events/${editEventId}?viewerId=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        if (active) {
          setSubmitMessage("編集対象のイベント情報を読み込めませんでした。");
          setIsEditLoading(false);
        }
        return;
      }

      const event = (await response.json()) as EventEditResponse;
      if (!active) return;

      setEditingOwnerId(event.owner.userId);

      if (event.owner.userId !== userId) {
        setSubmitMessage("このイベントはオーナーのみ編集できます。");
        setIsEditLoading(false);
        return;
      }

      setPurposeElements([event.purpose]);
      if (!purposeElementOptions.includes(event.purpose)) {
        setCustomPurposeOptions((prev) =>
          prev.includes(event.purpose) ? prev : [event.purpose, ...prev]
        );
      }

      setEventTitleInput(event.purpose);
      setIsTitleCustomized(true);
      setVisibility(event.visibility);
      setVisibilityTouched(true);
      setCapacity(normalizeCapacity(event.capacity));
      setCapacityTouched(true);

      const area = event.area?.trim() ?? "";
      if (area) {
        setEventAreaOptions((prev) => (prev.includes(area) ? prev : [area, ...prev]));
      }
      setSelectedEventArea(area);
      setAreaStepDone(Boolean(area));
      setFriendStepDone(true);
      setActiveStep(6);
      setIsFocusMode(false);

      const fixedStart = toDatetimeLocalValue(event.fixedStartTime);
      if (fixedStart) {
        setTimeSetting("manual");
        setFixedStart(fixedStart);
        setActiveCandidates([]);
      } else if (event.timeCandidates && event.timeCandidates.length > 0) {
        setTimeSetting("candidates");
        setFixedStart("");
        setActiveCandidates(
          event.timeCandidates.map((c) => ({
            id: generateId(),
            startTime: c.startTime,
            endTime: c.endTime,
          }))
        );
      } else {
        setTimeSetting("auto");
        setFixedStart("");
        setActiveCandidates([]);
      }

      if (event.fixedPlaceName && event.fixedPlaceAddress && event.fixedPlaceId) {
        setPlaceSetting("manual");
        setSelectedPlace({
          placeId: event.fixedPlaceId,
          name: event.fixedPlaceName,
          address: event.fixedPlaceAddress,
          lat: 0,
          lng: 0,
        });
      } else {
        setPlaceSetting("auto");
        setSelectedPlace(null);
      }

      setCandidatePlaces(event.placeCandidates ?? []);
      setEventComment(event.comment?.trim() ?? "");
      setInitialEditComparable(serializeComparable(buildComparableFromEvent(event)));
      setSubmitMessage(null);
      setIsEditLoading(false);
    };

    loadEventForEdit();

    return () => {
      active = false;
    };
  }, [editEventId, isEditMode, userId]);

  useEffect(() => {
    if (timeSetting !== "candidates" || !userId) return;
    if (hasFetchedSuggestionsRef.current) return;

    let active = true;
    setIsSuggestionsLoading(true);
    setIsSuggestionsError(false);

    const loadSuggestions = async () => {
      try {
        const response = await fetch(
          `/api/profiles/${encodeURIComponent(userId)}/time-suggestions`,
          { cache: "no-store" }
        );
        if (!active) return;
        if (response.ok) {
          const data = (await response.json()) as {
            defaults: { startTime: string; endTime: string }[];
            suggestions: { startTime: string; endTime: string }[];
          };
          hasFetchedSuggestionsRef.current = true;
          setActiveCandidates((prev) =>
            prev.length === 0
              ? data.defaults.map((c) => ({ id: generateId(), startTime: c.startTime, endTime: c.endTime }))
              : prev
          );
          setSuggestionPool(
            data.suggestions.map((c) => ({ id: generateId(), startTime: c.startTime, endTime: c.endTime }))
          );
        } else {
          if (!active) return;
          setIsSuggestionsError(true);
        }
      } catch {
        if (!active) return;
        setIsSuggestionsError(true);
      } finally {
        if (active) setIsSuggestionsLoading(false);
      }
    };

    loadSuggestions();
    return () => {
      active = false;
    };
  }, [timeSetting, userId, suggestionRetryCount]);

  useEffect(() => {
    if (!userId) {
      setFriends([]);
      return;
    }

    const loadFriends = async () => {
      const query = selectedEventArea
        ? `/api/friends?userId=${encodeURIComponent(userId)}&eventArea=${encodeURIComponent(selectedEventArea)}`
        : `/api/friends?userId=${encodeURIComponent(userId)}`;
      const response = await fetch(query);
      if (!response.ok) return;
      setFriends((await response.json()) as Friend[]);
    };

    loadFriends();
  }, [userId, selectedEventArea]);

  useEffect(() => {
    if (activeStep === 1) {
      scrollToCenter(purposeSectionRef.current);
    }
  }, [activeStep]);

  const allPurposeOptions = useMemo(
    () => [...customPurposeOptions, ...purposeElementOptions],
    [customPurposeOptions]
  );

  const autoTitle = useMemo(() => buildAutoTitle(purposeElements), [purposeElements]);
  const previousAutoTitleRef = useRef(autoTitle);
  const resolvedTitle = eventTitleInput.trim();

  useEffect(() => {
    const previousAutoTitle = previousAutoTitleRef.current;
    if (!isTitleCustomized || eventTitleInput === previousAutoTitle) {
      setEventTitleInput(autoTitle);
      setIsTitleCustomized(false);
    }
    previousAutoTitleRef.current = autoTitle;
  }, [autoTitle, eventTitleInput, isTitleCustomized]);

  const allUserTimeCandidates = useMemo(
    () => activeCandidates.map((c) => ({ startTime: c.startTime, endTime: c.endTime })),
    [activeCandidates]
  );

  const MAX_TIME_CANDIDATES = 5;
  const isCandidateFull = activeCandidates.length >= MAX_TIME_CANDIDATES;

  const isTimeManualValid =
    timeSetting === "manual"
      ? Boolean(fixedStart)
      : timeSetting === "candidates"
        ? allUserTimeCandidates.length > 0
        : true;
  const isPlaceManualValid = placeSetting === "manual" ? Boolean(selectedPlace) : true;
  const derivedScheduleMode: "fixed" | "candidate" =
    timeSetting === "manual" && placeSetting === "manual" ? "fixed" : "candidate";
  const isProfileComplete = profileCompletionRate >= 100;

  const currentEditComparable = useMemo<EventUpdateComparable>(
    () => ({
      purpose: resolvedTitle,
      comment: toComparableText(eventComment),
      eventArea: toComparableText(selectedEventArea),
      visibility,
      capacity: normalizeCapacity(capacity),
      timeSetting,
      placeSetting,
      fixedStartTime: timeSetting === "manual" ? fixedStart : null,
      candidateStartTimes:
        timeSetting === "candidates"
          ? [...activeCandidates.map((c) => c.startTime)].sort().join(",")
          : "",
      fixedPlace:
        placeSetting === "manual" && selectedPlace
          ? {
              placeId: toComparableText(selectedPlace.placeId),
              name: toComparableText(selectedPlace.name),
              address: toComparableText(selectedPlace.address),
            }
          : null,
    }),
    [activeCandidates, capacity, eventComment, fixedStart, placeSetting, resolvedTitle, selectedEventArea, selectedPlace, timeSetting, visibility]
  );

  const hasEditChanges = useMemo(() => {
    if (!isEditMode) return true;
    if (!initialEditComparable) return false;
    return serializeComparable(currentEditComparable) !== initialEditComparable;
  }, [currentEditComparable, initialEditComparable, isEditMode]);

  const isCreateDisabled =
    !userId ||
    isEditLoading ||
    isSubmitting ||
    (isEditMode && editingOwnerId != null && editingOwnerId !== userId) ||
    (isEditMode && !hasEditChanges) ||
    !isProfileComplete ||
    purposeElements.length === 0 ||
    !resolvedTitle ||
    !visibilityTouched ||
    !capacityTouched ||
    !selectedEventArea ||
    (isFocusMode && (!areaStepDone || !friendStepDone)) ||
    !isTimeManualValid ||
    !isPlaceManualValid;

  const helperText = useMemo(() => {
    if (timeSetting === "manual" && placeSetting === "manual") {
      return "日程と場所を固定して作成します。";
    }
    if (timeSetting === "manual") {
      return "日程は固定し、場所は候補から決定します。";
    }
    if (timeSetting === "candidates" && placeSetting === "manual") {
      return "日程候補を設定し、場所は固定して作成します。";
    }
    if (timeSetting === "candidates") {
      return "日程候補から参加者と日程を決定します。";
    }
    if (placeSetting === "manual") {
      return "場所は固定し、日程は候補から決定します。";
    }
    return "日程と場所は候補から決定されます。";
  }, [placeSetting, timeSetting]);

  const sortedInviteFriends = useMemo(() => {
    const normalizedSelectedArea = normalizeArea(selectedEventArea);

    return [...friends].sort((a, b) => {
      const sameAreaA =
        normalizedSelectedArea.length > 0 &&
        normalizeArea(a.area) === normalizedSelectedArea;
      const sameAreaB =
        normalizedSelectedArea.length > 0 &&
        normalizeArea(b.area) === normalizedSelectedArea;
      const areaScore = Number(sameAreaB) - Number(sameAreaA);
      if (areaScore !== 0) return areaScore;

      const favoriteScore = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
      if (favoriteScore !== 0) return favoriteScore;

      return a.displayName.localeCompare(b.displayName, "ja-JP");
    });
  }, [friends, selectedEventArea]);

  const filteredInviteFriends = useMemo(() => {
    const keyword = inviteSearch.trim().toLowerCase();
    if (!keyword) return sortedInviteFriends;

    return sortedInviteFriends.filter((friend) => {
      const area = friend.area ?? "";
      return (
        friend.displayName.toLowerCase().includes(keyword) ||
        area.toLowerCase().includes(keyword)
      );
    });
  }, [inviteSearch, sortedInviteFriends]);

  const toStepClass = (step: Step) =>
    !isFocusMode
      ? "relative z-10 rounded-3xl bg-white p-4 shadow-sm"
      : activeStep === step
        ? "relative z-40 rounded-3xl bg-white p-4 shadow-xl ring-2 ring-[var(--accent)]"
        : "relative z-10 rounded-3xl bg-white/70 p-4 opacity-45 pointer-events-none";

  const handlePurposeToggle = (element: string) => {
    setPurposeElements((prev) => {
      if (prev.includes(element)) {
        setPurposeMessage(null);
        return prev.filter((item) => item !== element);
      }
      if (prev.length >= 2) {
        setPurposeMessage("イベントの目的は最大2つまでです。");
        return prev;
      }
      setPurposeMessage(null);
      return [...prev, element];
    });
  };

  const handleAddPurposeOption = () => {
    const next = customPurposeInput.trim();
    if (!next) return;
    if (!customPurposeOptions.includes(next) && !purposeElementOptions.includes(next)) {
      setCustomPurposeOptions((prev) => [next, ...prev]);
    }
    setCustomPurposeInput("");
    setShowAddPurposeInput(false);
    handlePurposeToggle(next);
  };

  const handleSelectVisibility = (value: "public" | "limited" | "private") => {
    setVisibility(value);
    setVisibilityTouched(true);
  };

  const handleCapacityChange = (value: number) => {
    setCapacity(normalizeCapacity(value));
    setCapacityTouched(true);
  };

  const toggleInvite = (friendId: string) => {
    setSelectedInvites((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]
    );
  };

  const completeFriendStep = () => {
    if (!friendStepDone) {
      setFriendStepDone(true);
      if (isFocusMode) {
        setActiveStep(6);
        setTimeout(() => scrollToCenter(submitSectionRef.current), 120);
      }
    }
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
    const nextAreas = data.places ?? [];
    setAreaResults(nextAreas);
    setIsAreaSearching(false);
    if (nextAreas.length === 0) {
      setAreaMessage("一致する駅・市区町村が見つかりませんでした。");
    }
  };

  const addEventAreaOption = (area: PlaceResult) => {
    if (eventAreaOptions.includes(area.name)) {
      setAreaMessage("既に追加済みです。");
      return;
    }

    setEventAreaOptions((prev) => [area.name, ...prev]);
    setSelectedEventArea(area.name);
    setAreaMessage(null);
  };

  const completeAreaStep = () => {
    if (!selectedEventArea) {
      setAreaMessage("エリアを1つ選択してください。");
      return;
    }

    if (!areaStepDone) {
      setAreaStepDone(true);
      if (isFocusMode) {
        setActiveStep(5);
        setTimeout(() => scrollToCenter(friendSectionRef.current), 120);
      }
    }
  };

  const handleSearchPlaces = async () => {
    if (!placeQuery.trim()) {
      setSearchMessage("エリアやジャンルを入力して検索してください。");
      return;
    }

    setIsSearching(true);
    setSearchMessage(null);
    const response = await fetch(`/api/places/search?query=${encodeURIComponent(placeQuery)}&limit=8`);
    if (!response.ok) {
      setSearchMessage("検索に失敗しました。時間をおいて再度お試しください。");
      setIsSearching(false);
      return;
    }

    const data = (await response.json()) as { places: PlaceResult[] };
    const nextResults = data.places ?? [];
    setPlaceResults(nextResults);
    setIsSearching(false);
    if (nextResults.length === 0) {
      setSearchMessage("検索結果がありませんでした。別のキーワードでお試しください。");
    }
  };

  const toggleCandidatePlace = (place: PlaceResult) => {
    setCandidatePlaces((prev) => {
      if (prev.some((item) => item.placeId === place.placeId)) {
        return prev.filter((item) => item.placeId !== place.placeId);
      }
      if (prev.length >= 5) return prev;
      return [...prev, place];
    });
  };

  const handleSubmit = async () => {
    if (isCreateDisabled || submitLockRef.current) return;

    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      if (isEditMode && !hasEditChanges) {
        setSubmitMessage("変更がないため更新できません。");
        return;
      }

      if (!isProfileComplete) {
        setSubmitMessage("プロフィール設定が100%未満のため、イベントを作成できません。");
        return;
      }

      setSubmitMessage(null);

      const normalizedFixedStart =
        timeSetting === "manual"
          ? toIsoUtcStringFromLocalDateTime(fixedStart)
          : undefined;
      if (timeSetting === "manual" && !normalizedFixedStart) {
        setSubmitMessage("開始日時の形式が正しくありません。再入力してください。");
        return;
      }

      const requestBody = {
        ownerId: userId,
        purpose: resolvedTitle,
        comment: eventComment,
        visibility,
        capacity,
        scheduleMode: derivedScheduleMode,
        timeSetting,
        placeSetting,
        fixedStartTime: normalizedFixedStart,
        userTimeCandidates: timeSetting === "candidates" ? allUserTimeCandidates : undefined,
        fixedPlace:
          placeSetting === "manual" && selectedPlace
            ? {
                placeId: selectedPlace.placeId,
                name: selectedPlace.name,
                address: selectedPlace.address,
              }
            : undefined,
        eventArea: selectedEventArea,
        placeQuery: placeSetting === "auto" && placeQuery.trim() ? placeQuery : undefined,
        candidatePlaces: placeSetting === "auto" ? candidatePlaces : undefined,
        inviteeIds: selectedInvites,
      };

      const response = await fetch(
        isEditMode && editEventId ? `/api/events/${editEventId}` : "/api/events",
        {
          method: isEditMode && editEventId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setSubmitMessage(
          error?.message ?? "イベントの作成に失敗しました。設定内容をご確認ください。"
        );
        return;
      }

      const data = (await response.json()) as { id?: string; eventId?: string };
      const nextEventId = isEditMode ? editEventId : data.id;

      markFeedRefreshNeeded();

      if (nextEventId) {
        router.push(`/events/${nextEventId}`);
        return;
      }

      if (data.eventId) {
        router.push(`/events/${data.eventId}`);
      }
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-4">
      <header className="sticky top-0 z-40 border-b border-orange-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4 sm:max-w-5xl sm:px-6">
          <Link
            href="/"
            aria-label="フィードへ戻る"
            className="grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--foreground)] shadow-sm"
          >
            <span className="material-symbols-rounded">chevron_left</span>
          </Link>
          <h1 className="text-lg font-semibold">{isEditMode ? "イベント編集" : "イベント作成"}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6 sm:max-w-4xl sm:px-6 sm:py-10">
        {userId && !isProfileComplete && (
          <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
            プロフィール設定が {profileCompletionRate}% のため、イベント作成はできません。
            <Link href="/profile/setup" className="ml-2 font-semibold text-[var(--accent)]">
              プロフィールを更新する
            </Link>
          </div>
        )}

        {isEditMode && isEditLoading && (
          <div className="mb-6 rounded-3xl bg-white p-4 text-sm text-[var(--muted)] shadow-sm">
            イベント情報を読み込み中です...
          </div>
        )}

        <div className="relative pt-2">
          {isFocusMode && (
            <button
              type="button"
              aria-label="フォーカスモードを解除"
              onClick={() => setIsFocusMode(false)}
              className="fixed inset-0 z-20 bg-black/60"
            />
          )}

          <h1 className="text-2xl font-semibold">{isEditMode ? "イベントを編集" : "イベントをつくる"}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{helperText}</p>

          <div className="mt-6 space-y-5">
            <section ref={purposeSectionRef} className={toStepClass(1)}>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--accent)]">
                  イベントの目的<span className="ml-1 text-rose-500">*</span>
                </h2>
                <button
                  onClick={() => setShowAddPurposeInput((prev) => !prev)}
                  className={plusButtonClass}
                  aria-label="目的を追加"
                >
                  <span className="material-symbols-rounded text-sm">add</span>
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--accent)]">
                最初に目的を選択してください（最大2つ）。
              </p>

              {showAddPurposeInput && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    value={customPurposeInput}
                    onChange={(event) => setCustomPurposeInput(event.target.value)}
                    placeholder="例: 鍋"
                    className="flex-1 rounded-full bg-white px-4 py-2 text-sm shadow-sm"
                  />
                  <button
                    onClick={handleAddPurposeOption}
                    className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
                  >
                    追加
                  </button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {allPurposeOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => handlePurposeToggle(option)}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      purposeElements.includes(option)
                        ? "bg-[var(--accent)] text-white"
                        : purposeElements.length >= 2
                          ? "bg-gray-100 text-gray-400"
                          : "bg-white text-[var(--muted)] shadow-sm"
                    }`}
                    disabled={!purposeElements.includes(option) && purposeElements.length >= 2}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {purposeMessage && <p className="mt-2 text-xs text-[var(--accent)]">{purposeMessage}</p>}

              <label className="mt-4 block text-sm">
                <span className="font-semibold text-[var(--accent)]">
                  イベントタイトル<span className="ml-1 text-rose-500">*</span>
                </span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={eventTitleInput}
                    onChange={(event) => {
                      const next = event.target.value;
                      setEventTitleInput(next);
                      setIsTitleCustomized(next !== autoTitle);
                    }}
                    placeholder="例: 週末ゆる飲み in 恵比寿"
                    className="flex-1 rounded-2xl bg-white px-4 py-3 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEventTitleInput(autoTitle);
                      setIsTitleCustomized(false);
                    }}
                    disabled={eventTitleInput === autoTitle}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white text-[var(--muted)] shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="自動入力タイトルを復元"
                  >
                    <span className="material-symbols-rounded text-base">undo</span>
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  目的を設定すると自動で入力されます。自由に編集でき、右のボタンで自動入力へ戻せます。
                </p>
              </label>

              {isFocusMode && (
                <button
                  onClick={() => {
                    setActiveStep(2);
                    setTimeout(() => scrollToCenter(visibilitySectionRef.current), 120);
                  }}
                  disabled={purposeElements.length === 0}
                  className="mt-4 w-full rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  公開範囲の設定へ
                </button>
              )}
            </section>

            {(!isFocusMode || purposeElements.length > 0) && (
              <section ref={visibilitySectionRef} className={toStepClass(2)}>
                <h2 className="text-sm font-semibold text-[var(--accent)]">
                  公開範囲<span className="ml-1 text-rose-500">*</span>
                </h2>
                <p className="mt-1 text-xs text-[var(--accent)]">次に公開範囲を選択してください。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {visibilityOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSelectVisibility(option.value)}
                      className={`flex items-center gap-1 rounded-full px-4 py-2 text-xs font-semibold ${
                        visibility === option.value
                          ? "bg-[var(--accent)] text-white"
                          : "bg-white text-[var(--muted)] shadow-sm"
                      }`}
                    >
                      <span className="material-symbols-rounded text-sm">{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>

                {isFocusMode && (
                  <button
                    onClick={() => {
                      setActiveStep(3);
                      setTimeout(() => scrollToCenter(capacitySectionRef.current), 120);
                    }}
                    disabled={!visibilityTouched}
                    className="mt-4 w-full rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上限人数の設定へ
                  </button>
                )}
              </section>
            )}

            {(!isFocusMode || visibilityTouched) && (
              <section ref={capacitySectionRef} className={toStepClass(3)}>
                <h2 className="text-sm font-semibold text-[var(--accent)]">
                  上限人数<span className="ml-1 text-rose-500">*</span>
                </h2>
                <p className="mt-1 text-xs text-[var(--accent)]">続けて人数を決めてください。</p>
                <label className="mt-3 block text-sm">
                  上限人数: <span className="font-semibold text-[var(--accent)]">{capacity} 人</span>
                </label>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <p className="text-[11px] text-[var(--muted)]">クイック設定（2〜20人）</p>
                    <input
                      type="range"
                      min={2}
                      max={20}
                      step={1}
                      value={Math.min(capacity, 20)}
                      onChange={(event) => handleCapacityChange(Number(event.target.value))}
                      className="mt-2 w-full accent-[var(--accent)]"
                    />
                  </div>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--muted)] sm:w-36">
                    任意入力
                    <input
                      type="number"
                      min={2}
                      step={1}
                      value={capacity}
                      onChange={(event) => handleCapacityChange(Number(event.target.value))}
                      className="rounded-2xl bg-white px-3 py-2 text-sm text-[var(--foreground)] shadow-sm"
                    />
                  </label>
                </div>

                {isFocusMode && (
                  <button
                    onClick={() => {
                      setActiveStep(4);
                      setTimeout(() => scrollToCenter(areaSectionRef.current), 120);
                    }}
                    disabled={!capacityTouched}
                    className="mt-4 w-full rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    エリア設定へ
                  </button>
                )}
              </section>
            )}

            {(!isFocusMode || capacityTouched) && (
              <section ref={areaSectionRef} className={toStepClass(4)}>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--accent)]">
                    エリア設定<span className="ml-1 text-rose-500">*</span>
                  </h2>
                  <button
                    onClick={() => setIsAreaOverlayOpen(true)}
                    className={plusButtonClass}
                    aria-label="エリアを追加"
                  >
                    <span className="material-symbols-rounded text-sm">add</span>
                  </button>
                </div>
                {profileFavoriteAreas.length > 0 ? (
                  <p className="mt-1 text-xs text-[var(--accent)]">
                    プロフィールのよく行くエリアから自動選択しました。問題なければ次へ進んでください。
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[var(--accent)]">
                    プロフィールにエリアが未設定です。「＋」からエリアを追加してください。
                  </p>
                )}

                {eventAreaOptions.length === 0 ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-orange-200 bg-white/80 px-4 py-5 text-center text-xs text-[var(--muted)]">
                    「＋」からイベントで使うエリアを追加してください。
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {eventAreaOptions.map((area) => {
                      const selected = selectedEventArea === area;
                      return (
                        <button
                          key={area}
                          onClick={() => {
                            if (selected) {
                              setSelectedEventArea("");
                              setAreaStepDone(false);
                            } else {
                              setSelectedEventArea(area);
                            }
                            setAreaMessage(null);
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left ${
                            selected ? "bg-orange-50 shadow-md" : "bg-white shadow-sm"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-100 text-[var(--accent)]">
                              <span className="material-symbols-rounded text-base">location_on</span>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--foreground)]">{area}</p>
                              <p className="truncate text-xs text-[var(--muted)]">駅・市区町村</p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-[var(--muted)]">
                            {selected ? "選択中" : "選択"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {areaMessage && <p className="mt-2 text-xs text-[var(--muted)]">{areaMessage}</p>}

                {isFocusMode && (
                  <button
                    onClick={completeAreaStep}
                    className="mt-3 w-full rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
                  >
                    エリア設定を完了して招待設定へ
                  </button>
                )}
              </section>
            )}

            {(!isFocusMode || areaStepDone) && (
              <section ref={friendSectionRef} className={toStepClass(5)}>
                <h2 className="text-sm font-semibold text-[var(--accent)]">招待するフレンド</h2>
                <p className="mt-1 text-xs text-[var(--accent)]">最後に招待対象を選ぶか、スキップしてください。</p>
                {sortedInviteFriends.length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--muted)]">フレンドがまだ登録されていません。</p>
                ) : (
                  <div className="mt-3">
                    <input
                      value={inviteSearch}
                      onChange={(event) => setInviteSearch(event.target.value)}
                      placeholder="フレンド名・エリアで検索"
                      className="w-full rounded-full bg-white px-4 py-2 text-xs shadow-sm"
                    />
                    {filteredInviteFriends.length === 0 ? (
                      <p className="mt-3 text-xs text-[var(--muted)]">一致するフレンドがいません。</p>
                    ) : (
                      <div className="mt-3 max-h-[13.5rem] space-y-2 overflow-y-auto pr-1">
                        {filteredInviteFriends.map((friend) => {
                      const selected = selectedInvites.includes(friend.userId);
                      const isSameArea = Boolean(selectedEventArea) && friend.area === selectedEventArea;

                      return (
                      <button
                        key={friend.userId}
                        onClick={() => toggleInvite(friend.userId)}
                        className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left ${
                          selected
                            ? "bg-orange-50 shadow-md"
                            : "bg-white shadow-sm"
                        }`}
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          {(() => {
                            const avatar = friend.avatarIcon?.trim() ?? "";
                            const useImage = isImageAvatar(avatar);
                            const toneClass = getAvatarToneClass(friend.displayName.trim() || "user");

                            return (
                              <span
                                aria-hidden="true"
                                className={`grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-orange-100 text-sm ${
                                  useImage || avatar ? "bg-[#f7f4ef]/80" : toneClass
                                }`}
                              >
                                {useImage ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={avatar}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : avatar ? (
                                  avatar
                                ) : (
                                  <span className="material-symbols-rounded text-base">person</span>
                                )}
                              </span>
                            );
                          })()}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--foreground)]">{friend.displayName}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                                {friend.area ?? "エリア未設定"}
                              </span>
                              {friend.isFavorite && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  お気に入り
                                </span>
                              )}
                              {isSameArea && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  同エリア
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[var(--muted)]">
                          {selected ? "招待予定" : "未選択"}
                        </span>
                      </button>
                      );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {isFocusMode && (
                  <>
                    <button
                      onClick={completeFriendStep}
                      className="mt-3 w-full rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
                    >
                      招待設定を完了して確認へ
                    </button>
                    <button
                      onClick={completeFriendStep}
                      className="mt-2 w-full rounded-full bg-white px-4 py-2 text-xs font-semibold text-[var(--muted)] shadow-sm"
                    >
                      招待をスキップして確認へ
                    </button>
                  </>
                )}
              </section>
            )}

            {(!isFocusMode || friendStepDone) && (
              <div ref={submitSectionRef} className={toStepClass(6)}>
                <h2 className="text-sm font-semibold text-[var(--accent)]">{isEditMode ? "更新ボタン" : "作成ボタン"}</h2>
                <p className="mt-1 text-xs text-[var(--accent)]">
                  {isEditMode ? "内容を確認してイベントを更新してください。" : "内容を確認してイベントを作成してください。"}
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={isCreateDisabled}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="material-symbols-rounded">
                    {isSubmitting ? "progress_activity" : "rocket_launch"}
                  </span>
                  {isSubmitting
                    ? isEditMode
                      ? "更新中..."
                      : "作成中..."
                    : isEditMode
                      ? "更新する"
                      : "作成する"}
                </button>
              </div>
            )}

            {(!isFocusMode || capacityTouched) && (
              <section className="rounded-3xl bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold">日程の設定</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  日程の決め方を選択してください。
                </p>
                <div className="mt-3 space-y-2">
                  {timeSettingOptions.map((mode) => (
                    <button
                      key={mode.value}
                      onClick={() => setTimeSetting(mode.value)}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${
                        timeSetting === mode.value
                          ? "bg-orange-50 shadow-md"
                          : "bg-white shadow-sm"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{mode.label}</p>
                        <p className="text-xs text-[var(--muted)]">{mode.caption}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {mode.recommended && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            推奨
                          </span>
                        )}
                        <span className="text-xs font-semibold text-[var(--muted)]">
                          {timeSetting === mode.value ? "選択中" : "未選択"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {timeSetting === "candidates" && (
                  <div className="mt-4 space-y-4">
                    {/* 日程候補 */}
                    <div>
                      <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">日程候補</p>
                      {isSuggestionsLoading ? (
                        <p className="text-xs text-[var(--muted)]">候補を取得中...</p>
                      ) : isSuggestionsError ? (
                        <div className="space-y-2">
                          <p className="text-xs text-rose-500">
                            日程候補の取得に失敗しました。提案候補が表示されない場合は、日程を手動で追加してください。
                          </p>
                          <button
                            onClick={() => {
                              setIsSuggestionsError(false);
                              setSuggestionRetryCount((c) => c + 1);
                            }}
                            className="text-xs text-[var(--accent)] underline"
                          >
                            再試行する
                          </button>
                        </div>
                      ) : activeCandidates.length === 0 ? (
                        <p className="text-xs text-[var(--muted)]">
                          候補がありません。下の「提案候補」から選択するか、日程を手動追加してください。
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {activeCandidates.map((candidate) => (
                            <div
                              key={candidate.id}
                              className="flex items-center justify-between rounded-2xl bg-orange-50 px-4 py-3 shadow-sm"
                            >
                              <span className="text-sm">{formatCandidateStart(candidate.startTime)}</span>
                              <button
                                onClick={() =>
                                  setActiveCandidates((prev) => prev.filter((c) => c.id !== candidate.id))
                                }
                                className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-white text-[var(--muted)] shadow-sm"
                                aria-label="削除"
                              >
                                <span className="material-symbols-rounded text-sm">close</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {activeCandidates.length === 0 && !isSuggestionsLoading && (
                        <p className="mt-1 text-xs text-rose-500">
                          候補を1件以上追加してください。
                        </p>
                      )}
                    </div>

                    {/* 提案候補 */}
                    {!isSuggestionsLoading && suggestionPool.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">提案候補</p>
                        {isCandidateFull && (
                          <p className="mb-2 text-xs text-[var(--muted)]">
                            日程候補が{MAX_TIME_CANDIDATES}件に達したため追加できません。
                          </p>
                        )}
                        <div className="space-y-2">
                          {suggestionPool.map((candidate) => (
                            <button
                              key={candidate.id}
                              disabled={isCandidateFull}
                              onClick={() => {
                                if (isCandidateFull) return;
                                setSuggestionPool((prev) => prev.filter((c) => c.id !== candidate.id));
                                setActiveCandidates((prev) => [...prev, candidate]);
                              }}
                              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left shadow-sm ${
                                isCandidateFull
                                  ? "cursor-not-allowed bg-gray-50 opacity-50"
                                  : "bg-white"
                              }`}
                            >
                              <span className="text-sm">{formatCandidateStart(candidate.startTime)}</span>
                              <span className="material-symbols-rounded text-sm text-[var(--muted)]">add</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 手動追加 */}
                    <div>
                      {showManualDateInput ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="datetime-local"
                            value={manualDateInput}
                            onChange={(e) => setManualDateInput(e.target.value)}
                            className="rounded-2xl bg-white px-4 py-3 text-sm shadow-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (!manualDateInput || isCandidateFull) return;
                                const start = new Date(manualDateInput);
                                const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
                                setActiveCandidates((prev) => [
                                  ...prev,
                                  { id: generateId(), startTime: start.toISOString(), endTime: end.toISOString() },
                                ]);
                                setManualDateInput("");
                                setShowManualDateInput(false);
                              }}
                              disabled={!manualDateInput || isCandidateFull}
                              className="flex-1 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >
                              追加
                            </button>
                            <button
                              onClick={() => { setManualDateInput(""); setShowManualDateInput(false); }}
                              className="flex-1 rounded-full bg-white px-4 py-2 text-xs font-semibold text-[var(--muted)] shadow-sm"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowManualDateInput(true)}
                          disabled={isCandidateFull}
                          className={`flex items-center gap-1 rounded-full px-4 py-2 text-xs font-semibold shadow-sm ${
                            isCandidateFull
                              ? "cursor-not-allowed bg-gray-50 text-gray-400 opacity-50"
                              : "bg-white text-[var(--muted)]"
                          }`}
                        >
                          <span className="material-symbols-rounded text-sm">add</span>
                          日程を手動追加{isCandidateFull ? "（上限に達しました）" : ""}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {timeSetting === "manual" && (
                  <label className="mt-3 flex flex-col gap-2 text-sm">
                    開始日時
                    <input
                      type="datetime-local"
                      value={fixedStart}
                      onChange={(event) => setFixedStart(event.target.value)}
                      className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                    />
                  </label>
                )}
              </section>
            )}

            {(!isFocusMode || capacityTouched) && (
              <section className="rounded-3xl bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold">詳細設定（任意）</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  場所を手動設定したい場合のみ選択してください。
                </p>

                <label className="mt-4 block text-sm">
                  <span className="font-semibold text-[var(--foreground)]">コメント（任意）</span>
                  <textarea
                    value={eventComment}
                    onChange={(event) => setEventComment(event.target.value)}
                    placeholder="集合時の注意点や補足があれば入力"
                    className="mt-2 h-24 w-full rounded-2xl bg-white px-4 py-3 text-sm shadow-sm"
                  />
                </label>

                <div className="mt-5">
                  <p className="mb-2 text-sm font-medium">場所の設定</p>
                  <div className="space-y-2">
                    {placeSettingOptions.map((mode) => (
                      <button
                        key={`place-${mode.value}`}
                        onClick={() => setPlaceSetting(mode.value)}
                        className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${
                          placeSetting === mode.value
                            ? "bg-orange-50 shadow-md"
                            : "bg-white shadow-sm"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold">{mode.label}</p>
                          <p className="text-xs text-[var(--muted)]">{mode.caption}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {mode.recommended && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              推奨
                            </span>
                          )}
                          <span className="text-xs font-semibold text-[var(--muted)]">
                            {placeSetting === mode.value ? "選択中" : "未選択"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={placeQuery}
                      onChange={(event) => setPlaceQuery(event.target.value)}
                      placeholder="例: 恵比寿 イタリアン"
                      className="flex-1 rounded-full bg-white px-4 py-2 text-sm shadow-sm"
                    />
                    <button
                      onClick={handleSearchPlaces}
                      className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white sm:w-auto"
                    >
                      <span className="material-symbols-rounded">search</span>
                      検索
                    </button>
                  </div>

                  {searchMessage && <p className="mt-2 text-xs text-[var(--muted)]">{searchMessage}</p>}
                  {isSearching && <p className="mt-2 text-xs text-[var(--muted)]">検索中...</p>}

                  {!isSearching && placeResults.length > 0 && (
                    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                      {placeResults.map((place) => {
                        const selectedInFixed = selectedPlace?.placeId === place.placeId;
                        const selectedInCandidate = candidatePlaces.some((item) => item.placeId === place.placeId);
                        const selected = placeSetting === "manual" ? selectedInFixed : selectedInCandidate;

                        return (
                          <div
                            key={place.placeId}
                            className={`rounded-2xl px-4 py-3 ${
                              selected ? "bg-orange-50 shadow-md" : "bg-white shadow-sm"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Image
                                src={place.photoUrl ?? "/file.svg"}
                                alt={`${place.name} の写真`}
                                width={48}
                                height={48}
                                className="h-12 w-12 rounded-xl object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{place.name}</p>
                                <p className="mt-1 truncate text-xs text-[var(--muted)]">{place.address}</p>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                placeSetting === "manual"
                                  ? setSelectedPlace(place)
                                  : toggleCandidatePlace(place)
                              }
                              className="mt-2 w-full rounded-full bg-orange-100 px-4 py-2 text-xs font-semibold text-[var(--accent)]"
                            >
                              {selected ? "選択中" : placeSetting === "manual" ? "この場所で固定" : "候補に追加"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {placeSetting === "manual" && selectedPlace && (
                    <div className="mt-3 rounded-2xl bg-orange-50 p-3 shadow-sm">
                      <p className="text-xs text-[var(--muted)]">固定する場所</p>
                      <p className="text-sm font-semibold">{selectedPlace.name}</p>
                      <p className="text-xs text-[var(--muted)]">{selectedPlace.address}</p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {submitMessage && <p className="mt-5 text-sm text-[var(--accent)]">{submitMessage}</p>}
        </div>
      </main>

      {isAreaOverlayOpen && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center sm:p-6">
          <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">エリアを追加</h3>
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
                    const selected = eventAreaOptions.includes(area.name);
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
                          onClick={() => addEventAreaOption(area)}
                          disabled={selected}
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
