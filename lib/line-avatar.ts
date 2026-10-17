import { prisma } from "@/lib/prisma";

export const DEFAULT_LINE_AVATAR_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const getLineAvatarTtlMs = (): number => {
  const envMs = process.env.LINE_AVATAR_TTL_MS;
  if (envMs) {
    const parsed = parseInt(envMs, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  const envSec = process.env.LINE_AVATAR_TTL_SECONDS;
  if (envSec) {
    const parsed = parseInt(envSec, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed * 1000;
  }
  return DEFAULT_LINE_AVATAR_TTL_MS;
};

export const getLineApiRetryConfig = () => {
  const retriesEnv = process.env.LINE_API_MAX_RETRIES;
  const delayEnv = process.env.LINE_API_RETRY_DELAY_MS;
  const maxRetries = retriesEnv ? parseInt(retriesEnv, 10) : 2;
  const retryDelayMs = delayEnv ? parseInt(delayEnv, 10) : 500;
  return {
    maxRetries: Number.isNaN(maxRetries) || maxRetries < 0 ? 2 : maxRetries,
    retryDelayMs: Number.isNaN(retryDelayMs) || retryDelayMs < 0 ? 500 : retryDelayMs,
  };
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

export async function fetchLineProfilePicture(
  lineUserId: string,
  channelAccessToken?: string
): Promise<string | null> {
  const token =
    channelAccessToken ??
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ??
    process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    return null;
  }

  const response = await fetch(
    `https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.ok) {
    const data = (await response.json()) as { pictureUrl?: string };
    return data.pictureUrl ?? null;
  }

  if (response.status >= 500 || response.status === 429) {
    throw new Error(`LINE API HTTP ${response.status}`);
  }

  return null;
}

export type ProfileAvatarRefreshTarget = {
  userId: string;
  lineUserId?: string | null;
  avatarIcon?: string | null;
  avatarIconUpdatedAt?: Date | null;
};

export async function refreshLineAvatarIfExpired(
  profile: ProfileAvatarRefreshTarget,
  options?: {
    ttlMs?: number;
    dbClient?: typeof prisma;
    channelAccessToken?: string;
  }
): Promise<{ avatarIcon: string | null; updated: boolean }> {
  const db = options?.dbClient ?? prisma;
  const effectiveTtlMs = options?.ttlMs ?? getLineAvatarTtlMs();

  // LINE連携していない場合は対象外
  if (!profile.lineUserId) {
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  // TTL内の場合は更新不要
  if (!isLineAvatarExpired(profile.avatarIconUpdatedAt, effectiveTtlMs)) {
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  const token =
    options?.channelAccessToken ??
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN ??
    process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    // トークンが未設定の場合は既存アイコンを維持
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  const { maxRetries, retryDelayMs } = getLineApiRetryConfig();
  let latestPictureUrl: string | null = null;

  try {
    latestPictureUrl = await fetchWithRetry(
      async () => fetchLineProfilePicture(profile.lineUserId!, token),
      {
        maxRetries,
        delayMs: retryDelayMs,
        onRetry: (attempt, error) => {
          console.warn(
            `[LineAvatar] Retry ${attempt}/${maxRetries} for lineUserId: ${profile.lineUserId}. Reason:`,
            error instanceof Error ? error.message : error
          );
        },
      }
    );
  } catch (error) {
    console.error(
      `[LineAvatar] Failed to refresh avatar for userId: ${profile.userId} after ${maxRetries} retries.`,
      error instanceof Error ? error.message : error
    );
    // API失敗時は既存の画像URLをフォールバックとして維持
    if (profile.avatarIcon) {
      console.warn(`[LineAvatar] Falling back to existing avatar URL for userId: ${profile.userId}`);
    }
    return { avatarIcon: profile.avatarIcon ?? null, updated: false };
  }

  const existingIcon = profile.avatarIcon ?? null;
  const now = new Date();

  try {
    // LINE側で写真が取得できなかった場合（未設定など）で、既存画像がある場合は既存画像を保護
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
    console.error(`[LineAvatar] Failed to update profile in database for userId: ${profile.userId}`, dbError);
    return { avatarIcon: latestPictureUrl ?? existingIcon, updated: false };
  }
}
