import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { COMMUNITY_AXES, getCommunityType } from "@/lib/community-diagnosis/types";

type ProfileUpdates = {
  avatarIcon?: string;
  displayName?: string;
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
};

type DiagnosisRequestBody = {
  userId?: string;
  communityType?: string;
  axisScores?: Record<string, number>;
  // 診断フロー中に回答された未入力プロフィール項目のみが入る。
  // POST /api/profiles は配列を全置換するため、ここでは存在するキーだけを部分更新する
  profileUpdates?: ProfileUpdates;
};

// axisScores は 4段階評価のA極傾き (0.0〜1.0 の float)
const isValidAxisScores = (value: unknown): value is Record<string, number> => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return COMMUNITY_AXES.every((axis) => {
    const score = record[axis.key];
    return typeof score === "number" && isFinite(score) && score >= 0 && score <= 1;
  });
};

export async function POST(request: Request) {
  const body = (await request.json()) as DiagnosisRequestBody;

  if (!body.userId) {
    return NextResponse.json({ message: "userId is required" }, { status: 400 });
  }

  const typeDef = getCommunityType(body.communityType);
  if (!typeDef) {
    return NextResponse.json({ message: "Invalid communityType" }, { status: 400 });
  }

  if (!isValidAxisScores(body.axisScores)) {
    return NextResponse.json({ message: "Invalid axisScores" }, { status: 400 });
  }

  const updates = body.profileUpdates ?? {};
  const profileData = {
    ...(updates.avatarIcon !== undefined ? { avatarIcon: updates.avatarIcon } : {}),
    ...(updates.displayName !== undefined && updates.displayName.trim().length > 0
      ? { displayName: updates.displayName.trim() }
      : {}),
    ...(updates.gender !== undefined ? { gender: updates.gender } : {}),
    ...(updates.birthDate !== undefined
      ? { birthDate: updates.birthDate ? new Date(updates.birthDate) : null }
      : {}),
    ...(updates.playFrequency !== undefined ? { playFrequency: updates.playFrequency } : {}),
    ...(updates.drinkFrequency !== undefined ? { drinkFrequency: updates.drinkFrequency } : {}),
    ...(updates.budgetMin !== undefined ? { budgetMin: updates.budgetMin } : {}),
    ...(updates.budgetMax !== undefined ? { budgetMax: updates.budgetMax } : {}),
    ...(updates.ngFoods !== undefined ? { ngFoods: updates.ngFoods } : {}),
    ...(updates.favoriteAreas !== undefined ? { favoriteAreas: updates.favoriteAreas } : {}),
    ...(updates.favoritePlaces !== undefined ? { favoritePlaces: updates.favoritePlaces } : {}),
    ...(updates.availability !== undefined
      ? { availability: updates.availability as object }
      : {}),
  };

  const diagnosisData = {
    communityType: typeDef.code,
    communityAxisScores: body.axisScores,
    communityDiagnosedAt: new Date(),
  };

  const profile = await prisma.profile.upsert({
    where: { userId: body.userId },
    update: {
      ...profileData,
      ...diagnosisData,
    },
    create: {
      userId: body.userId,
      displayName: `ユーザー${body.userId.slice(0, 4)}`,
      ...profileData,
      ...diagnosisData,
    },
  });

  return NextResponse.json(profile);
}
