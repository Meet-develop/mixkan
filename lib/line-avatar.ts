import { prisma } from "@/lib/prisma";

export const DEFAULT_LINE_AVATAR_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const DEFAULT_LINE_API_TIMEOUT_MS = 3000; // 3 seconds
export const DEFAULT_LINE_AVATAR_FAILURE_COOLDOWN_MS = 1000 * 60 * 15; // 15 minutes

const parsePositiveInt = (raw?: string): number | null => {
  if (!raw || !raw.trim()) return null;
  const num = Number(raw);
  return Number.isFinite(num) && Number.isInteger(num) && num > 0 ? num : null;
};

const parseNonNegativeInt = (raw?: string): number | null => {
  if (!raw || !raw.trim()) return null;
  const num = Number(raw);
  return Number.isFinite(num) && Number.isInteger(num) && num >= 0 ? num : null;
};

export const getLineAvatarTtlMs = (): number => {
  const parsedMs = parsePositiveInt(process.env.LINE_AVATAR_TTL_MS);
  if (parsedMs !== null) {
    return parsedMs;
  }
  const parsedSec = parsePositiveInt(process.env.LINE_AVATAR_TTL_SECONDS);
  if (parsedSec !== null) {
    return parsedSec * 1000;
  }
  return DEFAULT_LINE_AVATAR_TTL_MS;
};

export const getLineApiRetryConfig = () => {
  const maxRetries = parseNonNegativeInt(process.env.LINE_API_MAX_RETRIES) ?? 2;
  const retryDelayMs = parseNonNegativeInt(process.env.LINE_API_RETRY_DELAY_MS) ?? 500;
  return {
    maxRetries,
    retryDelayMs,
  };
};

export const getLineApiTimeoutMs = (): number =>
  parsePositiveInt(process.env.LINE_API_TIMEOUT_MS) ?? DEFAULT_LINE_API_TIMEOUT_MS;

export const getLineAvatarFailureCooldownMs = (): number =>
  parseNonNegativeInt(process.env.LINE_AVATAR_FAILURE_COOLDOWN_MS) ??
  DEFAULT_LINE_AVATAR_FAILURE_COOLDOWN_MS;

export const resolveLineChannelToken = (explicitToken?: string): string | null => {
  const token =
    explicitToken ??
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ??
    process.env.LINE_CHANNEL_ACCESS_TOKEN;
  return token && token.trim().length > 0 ? token.trim() : null;
};

export const isLineHostedAvatar = (url?: string | null): boolean => {
  if (!url) {
    return true;
  }
  try {
    const { hostname } = new URL(url);
    return hostname === "line-scdn.net" || hostname.endsWith(".line-scdn.net");
  } catch {
    return false;
  }
};

export const isLineAvatarExpired = (
  avatarIconUpdatedAt: Date | null | undefined,
  ttlMs: number,
  now = Date.now()
): boolean => {
  if (!avatarIconUpdatedAt) {
    return true;
  }
  return now - avatarIconUpdatedAt.getTime() >= ttlMs;
};

export class LineApiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;

  constructor(message: string, options?: { status?: number; retryable?: boolean }) {
    super(message);
    this.name = "LineApiError";
    this.status = options?.status;
    this.retryable = options?.retryable ?? true;
  }
}

export async function fetchWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: {
    maxRetries: number;
    retryDelayMs?: number;
    delayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
    onRetry?: (attempt: number, error: unknown) => void;
  }
): Promise<T> {
  const delayMs = options.retryDelayMs ?? options.delayMs ?? 500;
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (error) {
      const canRetry =
        attempt < options.maxRetries &&
        !(error instanceof LineApiError && !error.retryable) &&
        (options.shouldRetry ? options.shouldRetry(error) : true);

      if (!canRetry) {
        throw error;
      }
      attempt++;
      if (options.onRetry) {
        options.onRetry(attempt, error);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

export async function fetchLineProfilePicture(
  lineUserId: string,
  channelAccessToken?: string
): Promise<string | null> {
  const token = resolveLineChannelToken(channelAccessToken);

  if (!token) {
    return null;
  }

  const timeoutMs = getLineApiTimeoutMs();
  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  if (response.ok) {
    const data = (await response.json()) as { pictureUrl?: string };
    return data.pictureUrl ?? null;
  }

  if (response.status === 404) {
    console.info(
      `[LineAvatar] LINE profile not found (404) for lineUserId: ${lineUserId}`
    );
    return null;
  }

  if (response.status === 401 || response.status === 403) {
    console.error(
      `[LineAvatar] LINE API authentication/authorization error (HTTP ${response.status}) for lineUserId: ${lineUserId}. Check channel access token.`
    );
    throw new LineApiError(`LINE API HTTP ${response.status}`, {
      status: response.status,
      retryable: false,
    });
  }

  if (response.status === 429) {
    console.warn(
      `[LineAvatar] LINE API rate limited (HTTP 429) for lineUserId: ${lineUserId}`
    );
    throw new LineApiError("LINE API HTTP 429", {
      status: 429,
      retryable: false,
    });
  }

  if (response.status >= 500) {
    throw new LineApiError(`LINE API HTTP ${response.status}`, {
      status: response.status,
      retryable: true,
    });
  }

  console.error(
    `[LineAvatar] LINE API client error (HTTP ${response.status}) for lineUserId: ${lineUserId}`
  );
  throw new LineApiError(`LINE API HTTP ${response.status}`, {
    status: response.status,
    retryable: false,
  });
}

export type ProfileAvatarRefreshTarget = {
  userId: string;
  lineUserId?: string | null;
  avatarIcon?: string | null;
  avatarIconUpdatedAt?: Date | null;
};

export type ProfileAvatarDbClient = {
  profile: {
    update: (args: {
      where: { userId: string };
      data: {
        avatarIcon?: string | null;
        avatarIconUpdatedAt: Date;
      };
    }) => Promise<unknown>;
  };
};

const inFlightRefreshes = new Map<
  string,
  Promise<{ avatarIcon: string | null; updated: boolean }>
>();
const failedAttemptAtByUser = new Map<string, number>();
let hasWarnedMissingToken = false;

export const resetLineAvatarRefreshState = (): void => {
  inFlightRefreshes.clear();
  failedAttemptAtByUser.clear();
  hasWarnedMissingToken = false;
};

export async function refreshLineAvatarIfExpired(
  profile: ProfileAvatarRefreshTarget,
  options?: {
    ttlMs?: number;
    failureCooldownMs?: number;
    now?: number;
    dbClient?: ProfileAvatarDbClient;
    channelAccessToken?: string;
  }
): Promise<{ avatarIcon: string | null; updated: boolean }> {
  const db = options?.dbClient ?? prisma;
  const effectiveTtlMs = options?.ttlMs ?? getLineAvatarTtlMs();
  const nowMs = options?.now ?? Date.now();

  // LINE連携していない場合は対象外
  if (!profile.lineUserId) {
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  // 独自アバター（LINEホスト以外のURL）が設定されている場合は上書き防止のため対象外
  if (!isLineHostedAvatar(profile.avatarIcon)) {
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  // TTL内の場合は更新不要
  if (!isLineAvatarExpired(profile.avatarIconUpdatedAt, effectiveTtlMs, nowMs)) {
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  // 直近の取得失敗からクールダウン期間内の場合は再試行を抑制
  const cooldownMs = options?.failureCooldownMs ?? getLineAvatarFailureCooldownMs();
  const lastFailedAt = failedAttemptAtByUser.get(profile.userId);
  if (lastFailedAt !== undefined && nowMs - lastFailedAt < cooldownMs) {
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  const token = resolveLineChannelToken(options?.channelAccessToken);

  if (!token) {
    // トークンが未設定の場合は初回のみ警告を出し、既存アイコンを維持
    if (!hasWarnedMissingToken) {
      console.warn(
        "[LineAvatar] LINE channel access token is not configured. Skipping avatar refresh."
      );
      hasWarnedMissingToken = true;
    }
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  const existingInFlight = inFlightRefreshes.get(profile.userId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const refreshPromise = (async (): Promise<{
    avatarIcon: string | null;
    updated: boolean;
  }> => {
    const { maxRetries, retryDelayMs } = getLineApiRetryConfig();
    let latestPictureUrl: string | null = null;
    let retryCount = 0;

    try {
      latestPictureUrl = await fetchWithRetry(
        async () => fetchLineProfilePicture(profile.lineUserId!, token),
        {
          maxRetries,
          retryDelayMs,
          onRetry: (attempt, error) => {
            retryCount = attempt;
            console.warn(
              `[LineAvatar] Retry ${attempt}/${maxRetries} for lineUserId: ${profile.lineUserId}. Reason:`,
              error instanceof Error ? error.message : error
            );
          },
        }
      );
      failedAttemptAtByUser.delete(profile.userId);
    } catch (error) {
      failedAttemptAtByUser.set(profile.userId, options?.now ?? Date.now());
      const retryNote =
        retryCount > 0 ? `after ${retryCount} retries` : "without retry";
      console.error(
        `[LineAvatar] Failed to refresh avatar for userId: ${profile.userId} (${retryNote}).`,
        error instanceof Error ? error.message : error
      );
      // API失敗時は既存の画像URLをフォールバックとして維持し、更新日時は進めない
      if (profile.avatarIcon) {
        console.warn(
          `[LineAvatar] Falling back to existing avatar URL for userId: ${profile.userId}`
        );
      }
      return { avatarIcon: profile.avatarIcon ?? null, updated: false };
    }

    const existingIcon = profile.avatarIcon ?? null;
    const now = new Date(options?.now ?? Date.now());

    try {
      // LINE側で写真が取得できなかった場合（未設定や404など）で、既存画像がある場合は既存画像を保護
      if (latestPictureUrl === null && existingIcon !== null) {
        await db.profile.update({
          where: { userId: profile.userId },
          data: { avatarIconUpdatedAt: now },
        });
        return { avatarIcon: existingIcon, updated: false };
      }

      // 画像URLに変更がない場合、不要なavatarIcon更新を行わず取得日時のみ更新
      if (latestPictureUrl === existingIcon) {
        console.info(
          `[LineAvatar] Avatar URL unchanged for userId: ${profile.userId}. Updating avatarIconUpdatedAt.`
        );
        await db.profile.update({
          where: { userId: profile.userId },
          data: { avatarIconUpdatedAt: now },
        });
        return { avatarIcon: existingIcon, updated: false };
      }

      // 最新の画像URLが取得でき、変更がある場合
      console.info(`[LineAvatar] Avatar URL updated for userId: ${profile.userId}`);
      await db.profile.update({
        where: { userId: profile.userId },
        data: {
          avatarIcon: latestPictureUrl,
          avatarIconUpdatedAt: now,
        },
      });

      return { avatarIcon: latestPictureUrl, updated: true };
    } catch (dbError) {
      console.error(
        `[LineAvatar] Failed to update profile in database for userId: ${profile.userId}`,
        dbError
      );
      return { avatarIcon: latestPictureUrl ?? existingIcon, updated: false };
    }
  })();

  inFlightRefreshes.set(profile.userId, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    inFlightRefreshes.delete(profile.userId);
  }
}
