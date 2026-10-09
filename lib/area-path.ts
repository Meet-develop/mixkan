export const JAPAN_PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

export function extractPrefecture(text: string): string | null {
  for (const pref of JAPAN_PREFECTURES) {
    if (text.includes(pref)) {
      return pref;
    }
  }
  return null;
}

const SPECIAL_CITIES = [
  "四日市市", "廿日市市", "野々市市", "十日町市", "八日市場市"
];

export function extractCityOrWard(text: string): string | null {
  let cleaned = text;
  const pref = extractPrefecture(text);
  if (pref) {
    cleaned = cleaned.replace(pref, "");
  }
  cleaned = cleaned.trim();

  for (const city of SPECIAL_CITIES) {
    if (cleaned.includes(city)) {
      return city;
    }
  }

  // 政令指定都市の区 (例: 横浜市中区, 大阪市北区)
  const wardMatch = cleaned.match(/([^\s,／/]+?市[^\s,／/]+?区)/);
  if (wardMatch) {
    return wardMatch[1];
  }

  const cityMatch = cleaned.match(/([^\s,／/]+?(?:市|区|町|村))/);
  if (cityMatch) {
    return cityMatch[1];
  }
  return null;
}

/**
 * Builds a hierarchical Materialized Path for an area (e.g., "島根県/松江市/松江駅").
 */
export function buildAreaPath(areaName: string | null | undefined, address?: string | null): string | null {
  if (!areaName || !areaName.trim()) {
    return null;
  }

  const name = areaName.trim();
  const addr = address ? address.trim() : "";
  const combinedText = `${addr} ${name}`;

  if (name.includes("/")) {
    return name.split("/").map((s) => s.trim()).filter(Boolean).join("/");
  }

  const pref = extractPrefecture(combinedText);
  const city = extractCityOrWard(combinedText);

  let cleanName = name;
  if (pref && cleanName.startsWith(pref)) {
    cleanName = cleanName.slice(pref.length).trim();
  }
  if (city && cleanName.startsWith(city)) {
    cleanName = cleanName.slice(city.length).trim();
  }

  const parts: string[] = [];
  if (pref) parts.push(pref);
  if (city && city !== pref) parts.push(city);

  if (cleanName && !parts.includes(cleanName)) {
    parts.push(cleanName);
  }

  return parts.join("/");
}

/**
 * Checks whether an event's area (or areaPath) matches target user area filters.
 * Prevents false positives where broad parent path parts (e.g. "東京都") inadvertently match
 * specific child filters (e.g. "東京都渋谷区" matching "東京都/八王子市/高尾").
 */
export function matchAreaPath(
  eventAreaPath: string | null | undefined,
  eventArea: string | null | undefined,
  userTargetAreas: string[]
): boolean {
  if (!userTargetAreas || userTargetAreas.length === 0) {
    return true; // No filter applied -> match all
  }

  const normalizedUserAreas = userTargetAreas
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);

  if (normalizedUserAreas.length === 0) {
    return true;
  }

  const rawArea = (eventArea ?? "").toLowerCase().trim();
  const rawPath = (eventAreaPath ?? "").toLowerCase().trim();
  const pathParts = rawPath ? rawPath.split("/").map((p) => p.trim()).filter(Boolean) : [];
  const joinedPath = pathParts.join("");

  for (const target of normalizedUserAreas) {
    // 1. 各階層の要素に target が含まれる、または完全一致 (例: target "松江市" -> part "松江市", target "松江" -> part "松江市")
    if (pathParts.some((part) => part.includes(target))) {
      return true;
    }

    // 2. target が複数階層を跨ぐ場合 (例: target "東京都渋谷区", path: "東京都/渋谷区/渋谷駅")
    const cleanTarget = target.replace(/[\s/]/g, "");
    if (joinedPath && joinedPath.includes(cleanTarget)) {
      return true;
    }

    // 3. rawArea に対する判定
    if (rawArea) {
      if (rawArea.includes(target) || (rawArea.length >= 2 && target.includes(rawArea))) {
        return true;
      }
    }
  }

  return false;
}
