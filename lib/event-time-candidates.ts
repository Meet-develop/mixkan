import {
  createUtcDateFromJstVirtualDate,
  getJstVirtualDateAtOffset,
} from "@/lib/datetime";

const dayIndex: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const weekdayKeyByIndex: Record<
  number,
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | undefined
> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type AvailabilityInput = {
  weekdaySlots?: Record<string, { daytime?: boolean; night?: boolean }>;
  days?: string[];
  timeRanges?: { start: string; end: string }[];
};

export type TimeCandidateInput = {
  startTime: Date;
  endTime: Date;
  score: number;
  source: "system";
};

export const MIN_CANDIDATE_OFFSET_DAYS = 3;

const isWeekdayKey = (value: string): value is WeekdayKey =>
  value === "mon" ||
  value === "tue" ||
  value === "wed" ||
  value === "thu" ||
  value === "fri" ||
  value === "sat" ||
  value === "sun";

const extractAvailableWeekdays = (availability: unknown): Set<WeekdayKey> => {
  if (!availability || typeof availability !== "object") {
    return new Set<WeekdayKey>();
  }

  const record = availability as AvailabilityInput;
  const days = new Set<WeekdayKey>();

  if (record.weekdaySlots && typeof record.weekdaySlots === "object") {
    for (const [day, slot] of Object.entries(record.weekdaySlots)) {
      if (!isWeekdayKey(day)) {
        continue;
      }
      if (slot?.daytime || slot?.night) {
        days.add(day);
      }
    }
    if (days.size > 0) {
      return days;
    }
  }

  if (Array.isArray(record.days)) {
    for (const day of record.days) {
      if (isWeekdayKey(day)) {
        days.add(day);
      }
    }
  }

  return days;
};

export const buildDayPriorityByWeekday = (availabilities: unknown[]) => {
  const priorityByWeekday: Record<WeekdayKey, number> = {
    mon: 0,
    tue: 0,
    wed: 0,
    thu: 0,
    fri: 0,
    sat: 0,
    sun: 0,
  };

  for (const availability of availabilities) {
    const availableDays = extractAvailableWeekdays(availability);
    for (const day of availableDays) {
      priorityByWeekday[day] += 1;
    }
  }

  return priorityByWeekday;
};

const pickTopTimeCandidates = (
  pool: Array<TimeCandidateInput & { dayKey: WeekdayKey; priority: number }>,
  limit: number = 3
) =>
  pool
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.startTime.getTime() - b.startTime.getTime();
    })
    .slice(0, limit)
    .map(({ startTime, endTime, score, source }) => ({
      startTime,
      endTime,
      score,
      source,
    }));

export const buildDefaultTimeCandidates = (
  availability?: AvailabilityInput,
  dayPriorityByWeekday?: Record<WeekdayKey, number>,
  baseNow: Date = new Date(),
  minOffset: number = MIN_CANDIDATE_OFFSET_DAYS,
  maxCandidates: number = 3,
  windowDays: number = 28
) => {
  const weekdaySlots = availability?.weekdaySlots;
  const candidates: Array<TimeCandidateInput & { dayKey: WeekdayKey; priority: number }> = [];

  const getDayPriority = (dayKey: WeekdayKey) =>
    dayPriorityByWeekday?.[dayKey] ?? 0;

  if (weekdaySlots) {
    let offset = minOffset;
    while (offset < minOffset + windowDays) {
      const jstVirtualDate = getJstVirtualDateAtOffset(baseNow, offset);
      const dayKey = weekdayKeyByIndex[jstVirtualDate.getUTCDay()];
      if (!dayKey) {
        offset += 1;
        continue;
      }

      const slot = weekdaySlots[dayKey];
      if (!slot?.daytime && !slot?.night) {
        offset += 1;
        continue;
      }

      if (slot.daytime) {
        const start = createUtcDateFromJstVirtualDate(jstVirtualDate, 13, 0);
        const end = createUtcDateFromJstVirtualDate(jstVirtualDate, 15, 0);
        candidates.push({
          startTime: start,
          endTime: end,
          score: 0,
          source: "system",
          dayKey,
          priority: getDayPriority(dayKey),
        });
      }

      if (slot.night) {
        const start = createUtcDateFromJstVirtualDate(jstVirtualDate, 19, 0);
        const end = createUtcDateFromJstVirtualDate(jstVirtualDate, 21, 0);
        candidates.push({
          startTime: start,
          endTime: end,
          score: 0,
          source: "system",
          dayKey,
          priority: getDayPriority(dayKey),
        });
      }

      offset += 1;
    }
  }

  if (candidates.length > 0) {
    return pickTopTimeCandidates(candidates, maxCandidates);
  }

  const startRange = availability?.timeRanges?.[0]?.start ?? "19:00";
  const endRange = availability?.timeRanges?.[0]?.end ?? "22:00";
  const availableDays = availability?.days
    ?.map((day: string) => dayIndex[day])
    .filter((day: number | undefined) => day !== undefined);
  let offset = minOffset;

  while (offset < minOffset + windowDays) {
    const jstVirtualDate = getJstVirtualDateAtOffset(baseNow, offset);
    const jstDayIndex = jstVirtualDate.getUTCDay();
    const dayKey = weekdayKeyByIndex[jstDayIndex];
    if (!dayKey) {
      offset += 1;
      continue;
    }
    if (availableDays && availableDays.length > 0 && !availableDays.includes(jstDayIndex)) {
      offset += 1;
      continue;
    }

    const [startHour, startMinute] = startRange.split(":").map(Number);
    const [endHour, endMinute] = endRange.split(":").map(Number);
    const start = createUtcDateFromJstVirtualDate(
      jstVirtualDate,
      startHour || 19,
      startMinute || 0
    );
    const end = createUtcDateFromJstVirtualDate(
      jstVirtualDate,
      endHour || 22,
      endMinute || 0
    );

    candidates.push({
      startTime: start,
      endTime: end,
      score: 0,
      source: "system",
      dayKey,
      priority: getDayPriority(dayKey),
    });
    offset += 1;
  }

  if (candidates.length === 0) {
    const fallbackVirtualDate = getJstVirtualDateAtOffset(baseNow, minOffset);
    const fallback = createUtcDateFromJstVirtualDate(fallbackVirtualDate, 19, 0);
    const end = createUtcDateFromJstVirtualDate(fallbackVirtualDate, 22, 0);
    return [{ startTime: fallback, endTime: end, score: 0, source: "system" as const }];
  }

  return pickTopTimeCandidates(candidates, maxCandidates);
};
