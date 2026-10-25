"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

type AuthOverlayProps = {
  initialMode?: AuthMode;
  returnTo?: string | null;
  initialMessage?: string | null;
  onClose?: () => void;
};

const toSafeReturnTo = (value?: string | null) => {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
};

export function AuthOverlay({
  initialMode = "login",
  returnTo,
  initialMessage,
  onClose,
}: AuthOverlayProps) {
  const router = useRouter();
  const configuredLineProvider =
    process.env.NEXT_PUBLIC_SUPABASE_LINE_PROVIDER?.trim() || null;
  const lineProviders = configuredLineProvider
    ? [configuredLineProvider, "line", "custom:line"].filter(
        (provider, index, list) => provider && list.indexOf(provider) === index
      )
    : ["line", "custom:line"];
  const lineScopes =
    process.env.NEXT_PUBLIC_SUPABASE_LINE_SCOPES?.trim() || "openid profile";
  const lineBotPrompt =
    process.env.NEXT_PUBLIC_LINE_BOT_PROMPT?.trim() || "aggressive";
  const hasSupabaseConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showOtherMethods, setShowOtherMethods] = useState(false);
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);

  const safeReturnTo = useMemo(() => toSafeReturnTo(returnTo), [returnTo]);
  const callbackPath = useMemo(
    () =>
      safeReturnTo
        ? `/auth/callback?returnTo=${encodeURIComponent(safeReturnTo)}`
        : "/auth/callback",
    [safeReturnTo]
  );

  useEffect(() => {
    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) {
        router.replace(callbackPath);
      }
    };

    void syncSession();
  }, [callbackPath, router]);

  const closeOverlay = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push(safeReturnTo ?? "/");
  };

  const handleLineLogin = async () => {
    setMessage(null);
    const redirectTo = `${window.location.origin}${callbackPath}`;
    let lastError: Error | null = null;

    for (const provider of lineProviders) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as never,
        options: {
          redirectTo,
          scopes: lineScopes,
          queryParams: {
            bot_prompt: lineBotPrompt,
          },
        },
      });

      if (!error) {
        return;
      }

      lastError = error;
      console.error("LINE OAuth start failed", {
        provider,
        message: error.message,
      });
    }

    if (lastError) {
      setMessage(
        `LINEログインに失敗しました: ${lastError.message}\n時間をおいて再試行するか、他の方法でログインしてください。`
      );
    }
  };

  const handleSignInWithPassword = async () => {
    setMessage(null);
    if (!email || !password) {
      setMessage("メールとパスワードを入力してください。");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(`ログインに失敗しました: ${error.message}`);
      return;
    }

    router.replace(callbackPath);
  };

  const handleSignUp = async () => {
    setMessage(null);
    if (!email || !password) {
      setMessage("メールとパスワードを入力してください。");
      return;
    }
    if (password.length < 6) {
      setMessage("パスワードは6文字以上で入力してください。");
      return;
    }

    const emailRedirectTo = `${window.location.origin}${callbackPath}`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      setMessage(`登録に失敗しました: ${error.message}`);
      return;
    }

    setMessage("登録完了。確認メールのリンクからログインを完了してください。");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center sm:p-6">
      <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {mode === "login" ? "ログイン" : "新規登録"}
          </h2>
          <button
            type="button"
            onClick={closeOverlay}
            className="grid h-8 w-8 place-items-center rounded-full bg-white text-[var(--muted)]"
            aria-label="閉じる"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <p className="mt-2 text-xs text-[var(--muted)]">
          {mode === "login"
            ? "LINEでログインして、すぐにイベントへ参加できます。"
            : "メールアドレスでアカウントを作成できます。"}
        </p>

        {!hasSupabaseConfig && (
          <p className="mt-3 text-xs text-[var(--accent)]">
            Supabase の環境変数が未設定です。.env を確認してください。
          </p>
        )}

        {mode === "login" && (
          <>
            <button
              onClick={handleLineLogin}
              disabled={!hasSupabaseConfig}
              className="group relative mt-4 flex h-12 w-full items-center overflow-hidden rounded-xl border border-transparent bg-[#06C755] text-white shadow-sm disabled:bg-white disabled:text-[rgba(30,30,30,0.2)]"
            >
              <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10 group-active:bg-black/30 group-disabled:bg-transparent" />

              <span className="relative grid h-full w-12 place-items-center border-r border-black/10 group-disabled:border-[rgba(229,229,229,0.6)]">
                <Image
                  src="/line_120.png"
                  alt="LINE"
                  width={24}
                  height={24}
                  className="h-6 w-6 object-contain group-disabled:opacity-20"
                  priority
                />
              </span>

              <span className="relative flex-1 text-center text-sm font-semibold">
                LINEでログイン
              </span>
            </button>

            {!showOtherMethods && (
              <button
                type="button"
                onClick={() => setShowOtherMethods(true)}
                className="mt-3 text-left text-xs font-semibold text-[var(--accent)] underline underline-offset-2"
              >
                他の方法でログイン
              </button>
            )}

            {showOtherMethods && (
              <div className="mt-3 grid gap-3">
                <label className="flex flex-col gap-2 text-sm">
                  メールアドレス
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  パスワード
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                  />
                </label>
                <button
                  onClick={handleSignInWithPassword}
                  className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white"
                >
                  <span className="material-symbols-rounded">login</span>
                  メールでログイン
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setMessage(null);
                    setShowOtherMethods(false);
                  }}
                  className="w-full rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[var(--accent)] shadow-sm"
                >
                  アカウントをお持ちでない方はこちら
                </button>
              </div>
            )}
          </>
        )}

        {mode === "signup" && (
          <>
            <div className="mt-4 grid gap-3">
              <label className="flex flex-col gap-2 text-sm">
                メールアドレス
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                パスワード
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded-2xl bg-white px-4 py-3 shadow-sm"
                />
              </label>
              <button
                onClick={handleSignUp}
                className="flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white"
              >
                <span className="material-symbols-rounded">person_add</span>
                メールで登録
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMode("login");
                setMessage(null);
              }}
              className="mt-4 w-full rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-[var(--accent)] shadow-sm"
            >
              既にアカウントをお持ちの方はこちら
            </button>
          </>
        )}

        {message && <p className="mt-3 text-xs text-[var(--accent)]">{message}</p>}
      </div>
    </div>
  );
}