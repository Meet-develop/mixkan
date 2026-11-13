import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  NOTIFICATION_CATEGORIES,
  isNotificationCategory,
  type NotificationCategory,
  type NotificationPreferencesResponse,
} from "@/lib/notification-categories";

const buildResponse = async (userId: string): Promise<NotificationPreferencesResponse> => {
  const [stored, pushSubscriptionCount, profile] = await Promise.all([
    prisma.notificationPreference.findMany({
      where: { userId },
      select: { category: true, enabled: true },
    }),
    prisma.pushSubscription.count({ where: { userId } }),
    prisma.profile.findUnique({ where: { userId }, select: { lineUserId: true } }),
  ]);

  const preferences = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => [category, true])
  ) as Record<NotificationCategory, boolean>;

  for (const preference of stored) {
    preferences[preference.category] = preference.enabled;
  }

  const lineLinked = Boolean(profile?.lineUserId?.trim());

  return {
    preferences,
    pushSubscriptionCount,
    lineLinked,
    lineActive: lineLinked && pushSubscriptionCount === 0,
  };
};

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ message: "Missing userId" }, { status: 400 });
  }

  return NextResponse.json(await buildResponse(userId));
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    preferences?: Record<string, unknown>;
  } | null;

  if (!body?.userId) {
    return NextResponse.json({ message: "Missing userId" }, { status: 400 });
  }

  const entries = Object.entries(body.preferences ?? {});
  if (entries.length === 0) {
    return NextResponse.json({ message: "Missing preferences" }, { status: 400 });
  }

  const updates: Array<{ category: NotificationCategory; enabled: boolean }> = [];
  for (const [category, enabled] of entries) {
    if (!isNotificationCategory(category) || typeof enabled !== "boolean") {
      return NextResponse.json(
        { message: `Invalid preference: ${category}` },
        { status: 400 }
      );
    }
    updates.push({ category, enabled });
  }

  const userId = body.userId;
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) {
    return NextResponse.json({ message: "Profile not found" }, { status: 404 });
  }

  await prisma.$transaction(
    updates.map(({ category, enabled }) =>
      prisma.notificationPreference.upsert({
        where: { userId_category: { userId, category } },
        update: { enabled },
        create: { userId, category, enabled },
      })
    )
  );

  return NextResponse.json(await buildResponse(userId));
}
