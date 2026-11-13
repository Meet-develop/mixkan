import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type SubscriptionBody = {
  userId?: string;
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  endpoint?: string;
};

const isValidEndpoint = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** Push 購読を登録する。同じ endpoint が既にあれば所有者・鍵を更新する */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SubscriptionBody | null;
  const userId = body?.userId;
  const endpoint = body?.subscription?.endpoint;
  const p256dh = body?.subscription?.keys?.p256dh;
  const auth = body?.subscription?.keys?.auth;

  if (!userId) {
    return NextResponse.json({ message: "Missing userId" }, { status: 400 });
  }

  if (!isValidEndpoint(endpoint) || !p256dh || !auth) {
    return NextResponse.json({ message: "Invalid subscription" }, { status: 400 });
  }

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) {
    return NextResponse.json({ message: "Profile not found" }, { status: 404 });
  }

  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh, auth, userAgent },
    create: { userId, endpoint, p256dh, auth, userAgent },
  });

  const pushSubscriptionCount = await prisma.pushSubscription.count({ where: { userId } });

  return NextResponse.json({ pushSubscriptionCount });
}

/** Push 購読を解除する。購読が 0 件になると LINE 通知が自動で再開する */
export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as SubscriptionBody | null;
  const userId = body?.userId;
  const endpoint = body?.endpoint;

  if (!userId || typeof endpoint !== "string") {
    return NextResponse.json({ message: "Missing userId or endpoint" }, { status: 400 });
  }

  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });

  const pushSubscriptionCount = await prisma.pushSubscription.count({ where: { userId } });

  return NextResponse.json({ pushSubscriptionCount });
}
