import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ message: "Missing userId" }, { status: 400 });
  }

  const favorites = await prisma.favoriteFriend.findMany({
    where: { userId },
    select: {
      favoriteUser: { select: { userId: true, displayName: true, avatarIcon: true } },
    },
  });

  return NextResponse.json(
    favorites.map((favorite) => ({
      userId: favorite.favoriteUser.userId,
      displayName: favorite.favoriteUser.displayName,
      avatarIcon: favorite.favoriteUser.avatarIcon,
    }))
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    userId?: string;
    favoriteUserId?: string;
    action?: "add" | "remove";
  };

  if (!body.userId || !body.favoriteUserId) {
    return NextResponse.json(
      { message: "userId and favoriteUserId are required" },
      { status: 400 }
    );
  }

  if (body.action === "remove") {
    await prisma.favoriteFriend.deleteMany({
      where: {
        userId: body.userId,
        favoriteUserId: body.favoriteUserId,
      },
    });
  } else {
    await prisma.favoriteFriend.upsert({
      where: {
        userId_favoriteUserId: {
          userId: body.userId,
          favoriteUserId: body.favoriteUserId,
        },
      },
      update: {},
      create: {
        userId: body.userId,
        favoriteUserId: body.favoriteUserId,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
