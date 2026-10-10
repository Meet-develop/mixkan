"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { markRecentAuth } from "@/lib/auth/recent-auth";

type ProfileStats = {
  completionRate?: number;
};

type ProfileResponse = {
  displayName?: string;
  avatarIcon?: string | null;
  birthDate?: string | null;
  lineUserId?: string | null;
  stats?: ProfileStats;
};

const LINE_PROVIDER_KEYS = ["line", "custom:line"];

const isLineProvider = (provider?: string) => {
  if (!provider) return false;
  const normalized = provider.toLowerCase();
  return LINE_PROVIDER_KEYS.some((key) => normalized === key || normalized.includes(key));
};

const isGenericFallbackDisplayName = (displayName?: string | null, userId?: string) => {
  if (!displayName) return true;
  const trimmed = displayName.trim();
  if (!trimmed) return true;

  if (userId && trimmed === `ユーザー${userId.slice(0, 4)}`) {
    return true;
  }

  return /^ユーザー[0-9a-f]{4}$/i.test(trimmed);
};

const sanitizeReturnTo = (value: string | null) => {
  if (!value) return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//")) return undefined;
  return value;
};

const isEventDetailPath = (path: string) => /^\/events\/[^/?#]+$/.test(path);

const buildLoginUrlWithError = (message: string, returnTo?: string) => {
  const params = new URLSearchParams();
  params.set("authError", message);
  if (returnTo) {
    params.set("returnTo", returnTo);
  }
  return `/login?${params.toString()}`;
};

const safeDecode = (value?: string | null) => {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const pickFirstString = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
};

const toBirthDate = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return trimmed;
};

const pickLineProfileDefaults = (user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }>;
}) => {
  const metadata = user.user_metadata ?? {};
  const lineIdentity = user.identities?.find((identity) => isLineProvider(identity.provider));
  const identityData = lineIdentity?.identity_data ?? {};

  const displayName = pickFirstString(
    metadata["display_name"],
    metadata["name"],
    metadata["full_name"],
    identityData["display_name"],
    identityData["name"],
    user.email?.split("@")[0]
  );
  const avatarIcon = pickFirstString(
    metadata["avatar_url"],
    metadata["picture"],
    metadata["profile_image"],
    identityData["avatar_url"],
    identityData["picture"],
    identityData["profile_image"]
  );
  const birthDate = toBirthDate(
    pickFirstString(
      metadata["birthdate"],
      metadata["birthday"],
      identityData["birthdate"],
      identityData["birthday"]
    )
  );

  return {
    displayName,
    avatarIcon,
    birthDate,
  };
};

const pickLineUserId = (user: {
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }>;
}) => {
  const metadata = user.user_metadata ?? {};
  const lineIdentity = user.identities?.find((identity) => isLineProvider(identity.provider));
  const identityData = lineIdentity?.identity_data ?? {};

  return pickFirstString(
    identityData["sub"],
    identityData["userId"],
    metadata["line_user_id"],
    metadata["sub"]
  );
};

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const resolveRedirect = async () => {
      const callbackUrl = new URL(window.location.href);
      const code = callbackUrl.searchParams.get("code");
      const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ""));
      const oauthError =
        callbackUrl.searchParams.get("error") ?? hashParams.get("error");
      const oauthErrorDescription = safeDecode(
        callbackUrl.searchParams.get("error_description") ??
          hashParams.get("error_description")
      );
      const returnTo = sanitizeReturnTo(callbackUrl.searchParams.get("returnTo"));
      const eventReturnTo = returnTo && isEventDetailPath(returnTo) ? returnTo : undefined;

      if (oauthError || oauthErrorDescription) {
        if (active) {
          const rawMessage = oauthErrorDescription ?? oauthError ?? "LINEログインに失敗しました。";
          const message = /an unknown error occurred/i.test(rawMessage)
            ? "LINE認証で不明なエラーが発生しました。時間をおいて再試行してください。"
            : rawMessage;
          router.replace(buildLoginUrlWithError(message, returnTo));
        }
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("Supabase auth callback error:", error);
          if (active) {
            router.replace(buildLoginUrlWithError(error.message, returnTo));
          }
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        if (active) {
          router.replace(
            buildLoginUrlWithError(
              "認証セッションを確認できませんでした。SupabaseのLINE Provider設定とRedirect URLを確認してください。",
              returnTo
            )
          );
        }
        return;
      }

      const lineDefaults = pickLineProfileDefaults({
        email: session.user.email,
        user_metadata: session.user.user_metadata,
        identities: session.user.identities,
      });
      const lineUserId = pickLineUserId({
        user_metadata: session.user.user_metadata,
        identities: session.user.identities,
      });

      const response = await fetch(
        `/api/profiles/${session.user.id}?viewerId=${encodeURIComponent(session.user.id)}`,
        {
          cache: "no-store",
        }
      );

      if (!active) {
        return;
      }

      const fallbackDisplayName =
        lineDefaults.displayName ??
        session.user.email?.split("@")[0] ??
        `ユーザー${session.user.id.slice(0, 4)}`;

      let profile: ProfileResponse | null = null;

      if (response.ok) {
        profile = (await response.json()) as ProfileResponse;
      } else {
        const pendingInviteToken = (() => {
          try {
            return window.sessionStorage.getItem("pendingInviteToken");
          } catch {
            return null;
          }
        })();

        await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: session.user.id,
            displayName: fallbackDisplayName,
            avatarIcon: lineDefaults.avatarIcon,
            avatarIconUpdatedAt: lineDefaults.avatarIcon ? new Date().toISOString() : undefined,
            birthDate: lineDefaults.birthDate,
            lineUserId,
            inviteToken: pendingInviteToken ?? undefined,
          }),
        });

        const refetchedProfile = await fetch(
          `/api/profiles/${session.user.id}?viewerId=${encodeURIComponent(session.user.id)}`,
          {
            cache: "no-store",
          }
        );
        if (refetchedProfile.ok) {
          profile = (await refetchedProfile.json()) as ProfileResponse;
        }
      }

      const needsLinePatch = Boolean(
        profile &&
          ((lineDefaults.displayName &&
            isGenericFallbackDisplayName(profile.displayName, session.user.id)) ||
            (lineDefaults.avatarIcon && !profile.avatarIcon) ||
            (lineDefaults.birthDate && !profile.birthDate) ||
            (lineUserId && !profile.lineUserId))
      );

      if (profile && needsLinePatch && (lineDefaults.displayName || profile.displayName)) {
        const resolvedDisplayName =
          lineDefaults.displayName &&
          isGenericFallbackDisplayName(profile.displayName, session.user.id)
            ? lineDefaults.displayName
            : profile.displayName;

        const resolvedAvatarIcon = profile.avatarIcon ?? lineDefaults.avatarIcon;

        await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: session.user.id,
            displayName: resolvedDisplayName,
            avatarIcon: resolvedAvatarIcon,
            avatarIconUpdatedAt: resolvedAvatarIcon ? new Date().toISOString() : undefined,
            birthDate: profile.birthDate ?? lineDefaults.birthDate,
            lineUserId: profile.lineUserId ?? lineUserId,
          }),
        });
      }

      const redirectPath = eventReturnTo ?? "/profile/setup";
      markRecentAuth();
      try {
        window.sessionStorage.removeItem("pendingInviteToken");
        window.sessionStorage.removeItem("pendingInviteRef");
      } catch {
        // ignore
      }
      router.replace(redirectPath);
    };

    void resolveRedirect();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="w-full max-w-sm rounded-3xl border border-orange-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-100 border-t-[var(--accent)]" />
        <p className="mt-4 text-sm text-[var(--muted)]">認証情報を確認しています...</p>
      </div>
    </div>
  );
}
