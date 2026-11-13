import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAppNotification } from "@/lib/notification-delivery";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    userId?: string;
    displayName?: string;
    avatarIcon?: string;
    avatarIconUpdatedAt?: string;
    lineUserId?: string;
    gender?: "male" | "female" | "other" | "unspecified";
    birthDate?: string;
    playFrequency?: "low" | "medium" | "high";
    drinkFrequency?: "never" | "sometimes" | "often";
    budgetMin?: number;
    budgetMax?: number;
    ngFoods?: string[];
    favoriteAreas?: string[];
    favoritePlaces?: string[];
    availability?: unknown;
    inviteToken?: string | null;
  };

  if (!body.userId || !body.displayName) {
    return NextResponse.json(
      { message: "userId and displayName are required" },
      { status: 400 }
    );
  }

  const now = new Date();
  if (body.avatarIconUpdatedAt !== undefined) {
    const parsedAvatarUpdatedAt = new Date(body.avatarIconUpdatedAt);
    if (
      typeof body.avatarIconUpdatedAt !== "string" ||
      Number.isNaN(parsedAvatarUpdatedAt.getTime()) ||
      parsedAvatarUpdatedAt.getTime() > now.getTime()
    ) {
      return NextResponse.json(
        { message: "avatarIconUpdatedAt must be a valid past or present date" },
        { status: 400 }
      );
    }
  }

  const existingProfile = await prisma.profile.findUnique({
    where: { userId: body.userId },
    select: { userId: true, avatarIcon: true },
  });

  const isAvatarChanged =
    Boolean(body.avatarIcon) && body.avatarIcon !== existingProfile?.avatarIcon;
  const avatarIconUpdatedAt = isAvatarChanged ? now : undefined;

  const profile = await prisma.profile.upsert({
    where: { userId: body.userId },
    update: {
      displayName: body.displayName,
      avatarIcon: body.avatarIcon,
      avatarIconUpdatedAt,
      lineUserId: body.lineUserId,
      gender: body.gender,
      birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
      playFrequency: body.playFrequency,
      drinkFrequency: body.drinkFrequency,
      budgetMin: body.budgetMin,
      budgetMax: body.budgetMax,
      ngFoods: body.ngFoods ?? [],
      favoriteAreas: body.favoriteAreas ?? [],
      favoritePlaces: body.favoritePlaces ?? [],
      availability: (body.availability ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    create: {
      userId: body.userId,
      displayName: body.displayName,
      avatarIcon: body.avatarIcon,
      avatarIconUpdatedAt,
      lineUserId: body.lineUserId,
      gender: body.gender ?? "unspecified",
      birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
      playFrequency: body.playFrequency,
      drinkFrequency: body.drinkFrequency,
      budgetMin: body.budgetMin,
      budgetMax: body.budgetMax,
      ngFoods: body.ngFoods ?? [],
      favoriteAreas: body.favoriteAreas ?? [],
      favoritePlaces: body.favoritePlaces ?? [],
      availability: (body.availability ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  if (!existingProfile) {
    await createAppNotification({
      userId: body.userId,
      type: "friend_added",
      title: "プロフィール登録のお願い",
      body:
        "プロフィールを登録すると、イベント作成やマッチングがスムーズになります。プロフィール設定を完了しましょう。",
      message:
        "プロフィールを登録すると、イベント作成やマッチングがスムーズになります。プロフィール設定を完了しましょう。",
    });
    // If user was created via an invite link, attach invite and create pending friendship
    if (body.inviteToken) {
      try {
        const invite = await prisma.eventInvite.findUnique({ where: { token: body.inviteToken } });
        if (invite && !invite.inviteeId) {
          await prisma.eventInvite.update({
            where: { id: invite.id },
            data: { inviteeId: body.userId, status: "accepted" },
          });

          await prisma.friendship.createMany({
            data: [
              { userId: body.userId, friendId: invite.inviterId, status: "pending" },
              { userId: invite.inviterId, friendId: body.userId, status: "pending" },
            ],
            skipDuplicates: true,
          });
        }
      } catch {
        // Ignore invite processing failures to avoid blocking profile creation
      }
    }
  }

  return NextResponse.json(profile);
}
