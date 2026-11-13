import webpush, { WebPushError } from "web-push";

export type PushMessage = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSendResult = "sent" | "expired" | "failed";

let vapidConfigured: boolean | null = null;

export const isWebPushConfigured = () => {
  if (vapidConfigured !== null) return vapidConfigured;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    vapidConfigured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
};

export const sendWebPush = async (
  target: PushTarget,
  message: PushMessage,
  options: { ttlSeconds?: number; urgency?: "normal" | "high" } = {}
): Promise<PushSendResult> => {
  if (!isWebPushConfigured()) return "failed";

  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(message),
      {
        TTL: options.ttlSeconds ?? 60 * 60 * 24,
        urgency: options.urgency ?? "normal",
      }
    );
    return "sent";
  } catch (error) {
    // 404 / 410 は購読が失効している（ブラウザ側で解除・アンインストール等）
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      return "expired";
    }
    console.error("Failed to send web push", error);
    return "failed";
  }
};
