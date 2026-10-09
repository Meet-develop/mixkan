import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildDefaultTimeCandidates,
  type AvailabilityInput,
} from "@/lib/event-time-candidates";

const TWO_WEEKS = 14;
const DEFAULT_COUNT = 3;
const SUGGESTION_COUNT = 5;
const WINDOW_DAYS = 56;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const profile = await prisma.profile.findUnique({
      where: { userId: id },
      select: { availability: true },
    });

    if (!profile) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const availability = profile.availability as AvailabilityInput | undefined;

    const allCandidates = buildDefaultTimeCandidates(
      availability,
      undefined,
      new Date(),
      TWO_WEEKS,
      DEFAULT_COUNT + SUGGESTION_COUNT,
      WINDOW_DAYS
    );

    const defaults = allCandidates.slice(0, DEFAULT_COUNT);
    const suggestions = allCandidates.slice(DEFAULT_COUNT);

    const toEntry = (c: { startTime: Date; endTime: Date }) => ({
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
    });

    return NextResponse.json({
      defaults: defaults.map(toEntry),
      suggestions: suggestions.map(toEntry),
    });
  } catch (error) {
    console.error("[time-suggestions] unexpected error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
