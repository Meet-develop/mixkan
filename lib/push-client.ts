"use client";

// ブラウザ側の Web Push 購読管理

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
};

export const isPushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/** iOS Safari はホーム画面に追加した PWA でのみ Web Push を利用できる */
export const needsHomeScreenInstall = () => {
  if (typeof window === "undefined") return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
};

const getRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
};

export const getCurrentPushSubscription = async () => {
  if (!isPushSupported()) return null;
  const registration = await getRegistration();
  return registration.pushManager.getSubscription();
};

const saveSubscription = async (userId: string, subscription: PushSubscription) => {
  const response = await fetch("/api/notifications/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, subscription: subscription.toJSON() }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save push subscription: ${response.status}`);
  }
};

export type EnablePushResult = "enabled" | "denied" | "unsupported" | "not_configured";

export const enablePush = async (userId: string): Promise<EnablePushResult> => {
  if (!isPushSupported()) return "unsupported";

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) return "not_configured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const registration = await getRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await saveSubscription(userId, subscription);
  return "enabled";
};

export const disablePush = async (userId: string) => {
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;

  const response = await fetch("/api/notifications/push-subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, endpoint: subscription.endpoint }),
  });
  if (!response.ok) {
    throw new Error(`Failed to delete push subscription: ${response.status}`);
  }

  await subscription.unsubscribe();
};

/**
 * 既に許可済みの端末で、ブラウザ側の購読をサーバーに再登録する。
 * 購読の更新（鍵のローテーション等）やログインユーザーの切り替えに追従するため、アプリ起動時に呼ぶ。
 */
export const syncPushSubscription = async (userId: string) => {
  if (!isPushSupported() || Notification.permission !== "granted") return;
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  await saveSubscription(userId, subscription);
};
