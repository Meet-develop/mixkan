import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const userOnly = searchParams.get("userOnly") === "true";

  if (userOnly && !userId) {
    return NextResponse.json({ message: "userId is required when userOnly is true" }, { status: 400 });
  }

  const whereClause = userOnly && userId
    ? { members: { some: { userId } } }
    : {};

  const communities = await prisma.community.findMany({
    where: whereClause,
    include: {
      members: {
        select: {
          userId: true,
          role: true,
        },
      },
      _count: {
        select: { members: true, events: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const formatted = communities.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    memberCount: c._count.members,
    eventCount: c._count.events,
    isMember: userId ? c.members.some((m) => m.userId === userId) : false,
    myRole: userId ? c.members.find((m) => m.userId === userId)?.role ?? null : null,
  }));

  return NextResponse.json(formatted, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    description?: string;
    userId?: string;
  };

  const name = body.name?.trim();
  const userId = body.userId?.trim();

  if (!name) {
    return NextResponse.json({ message: "コミュニティ名は必須です" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ message: "userId は必須です" }, { status: 400 });
  }

  // プロフィール存在確認（なければ作成）
  let profile = await prisma.profile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        userId,
        displayName: `ユーザー${userId.slice(0, 4)}`,
        gender: "unspecified",
      },
    });
  }

  const community = await prisma.community.create({
    data: {
      name,
      description: body.description?.trim() || null,
      members: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
    include: {
      _count: {
        select: { members: true },
      },
    },
  });

  return NextResponse.json({
    id: community.id,
    name: community.name,
    description: community.description,
    memberCount: community._count.members,
    isMember: true,
    myRole: "owner",
  });
}
