import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toNotificationView } from "@/lib/notification-content";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const period = searchParams.get("period") ?? "all";

  if (!userId) {
    return NextResponse.json({ message: "Missing userId" }, { status: 400 });
  }

  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) {
    await prisma.profile.create({
      data: {
        userId,
        displayName: `ユーザー${userId.slice(0, 4)}`,
        gender: "unspecified",
      },
    });
  }

  const now = new Date();
  const periodStart =
    period === "7d"
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : period === "30d"
        ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        : period === "90d"
          ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          : null;

  const where = {
    userId,
    ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(notifications.map(toNotificationView));
}
