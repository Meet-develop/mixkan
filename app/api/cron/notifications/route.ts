import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNotificationReminders } from "@/lib/notification-reminders";

export const dynamic = "force-dynamic";

const isAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

/**
 * リマインド通知（前日・1時間前・招待未回答）を送信する。
 * 10 分程度の間隔で外部スケジューラー（Supabase pg_cron / Vercel Cron 等）から呼び出す。
 * 送信済み判定は通知履歴で行うため、繰り返し呼ばれても同じリマインドは再送されない（同時実行は想定しない）。
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNotificationReminders();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to run notification reminders", error);
    return NextResponse.json({ message: "Failed to run reminders" }, { status: 500 });
  }
}

export const POST = GET;
