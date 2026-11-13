import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await prisma.event.updateMany({
      where: {
        status: "confirmed",
        fixedStartTime: {
          lte: oneHourAgo,
        },
      },
      data: {
        status: "completed",
      },
    });

    console.log(`[update-status] Completed events status check. Updated ${result.count} events.`);

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
    });
  } catch (error) {
    console.error("[update-status] Failed to update event statuses:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
