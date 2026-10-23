import { prisma } from "@/lib/prisma";

let authIdentityLookupUnavailable = false;

/**
 * Supabase Auth の identities から LINE のユーザーID（OIDC の sub）を取得する。
 * auth スキーマが存在しない環境（ローカル DB など）では null を返す。
 */
export const findLineUserIdFromAuth = async (userId: string) => {
  if (authIdentityLookupUnavailable) return null;

  try {
    const rows = await prisma.$queryRaw<{ provider_id: string | null }[]>`
      SELECT provider_id
      FROM auth.identities
      WHERE user_id = ${userId}::uuid
        AND provider ILIKE '%line%'
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `;
    return rows[0]?.provider_id?.trim() || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // auth スキーマが無い・権限が無い環境では以降の問い合わせを止める（一時的なエラーでは止めない）
    if (/does not exist|permission denied/i.test(message)) {
      authIdentityLookupUnavailable = true;
    }
    console.warn("Failed to look up LINE user id from auth.identities", error);
    return null;
  }
};

/**
 * プロフィールに lineUserId を紐付ける。
 * releaseFromOthers が true の場合、同じ lineUserId を持つ別プロフィール（作り直し前の古いユーザー等）から付け替える。
 * 紐付けに失敗してもエラーは投げず false を返す。
 */
export const linkLineUserId = async (
  userId: string,
  lineUserId: string,
  { releaseFromOthers }: { releaseFromOthers: boolean }
) => {
  try {
    if (releaseFromOthers) {
      await prisma.$transaction([
        prisma.profile.updateMany({
          where: { lineUserId, NOT: { userId } },
          data: { lineUserId: null },
        }),
        prisma.profile.update({
          where: { userId },
          data: { lineUserId },
        }),
      ]);
    } else {
      await prisma.profile.update({
        where: { userId },
        data: { lineUserId },
      });
    }
    return true;
  } catch (error) {
    console.error("Failed to link LINE user id to profile", { userId, error });
    return false;
  }
};

/**
 * プロフィールに lineUserId が無い場合、Supabase Auth の identities から補完して保存する。
 */
export const ensureLineUserIdLinked = async (userId: string) => {
  const lineUserId = await findLineUserIdFromAuth(userId);
  if (!lineUserId) return null;

  const linked = await linkLineUserId(userId, lineUserId, { releaseFromOthers: true });
  return linked ? lineUserId : null;
};
