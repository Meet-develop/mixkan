import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const toIcsDateTimeUtc = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const escapeIcsText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

const createIcsBody = (params: {
  uid: string;
  summary: string;
  description: string;
  location: string;
  url: string;
  startsAt: Date;
  endsAt: Date;
}) => {
  const dtStamp = toIcsDateTimeUtc(new Date());
  const dtStart = toIcsDateTimeUtc(params.startsAt);
  const dtEnd = toIcsDateTimeUtc(params.endsAt);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "PRODID:-//mixkan//Event Calendar//JA",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(params.summary)}`,
    `DESCRIPTION:${escapeIcsText(params.description)}`,
    `LOCATION:${escapeIcsText(params.location)}`,
    `URL:${params.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      purpose: true,
      comment: true,
      fixedStartTime: true,
      fixedEndTime: true,
      fixedPlaceName: true,
      fixedPlaceAddress: true,
      timeCandidates: {
        select: {
          startTime: true,
          endTime: true,
        },
        orderBy: {
          startTime: "asc",
        },
        take: 1,
      },
    },
  });

  if (!event) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const fallbackCandidate = event.timeCandidates[0];
  const startsAt = event.fixedStartTime ?? fallbackCandidate?.startTime;

  if (!startsAt) {
    return NextResponse.json(
      { message: "Event start time is not set" },
      { status: 400 }
    );
  }

  const endsAt =
    event.fixedEndTime ??
    fallbackCandidate?.endTime ??
    new Date(startsAt.getTime() + 60 * 60 * 1000);

  const baseUrl = request.headers.get("origin") ?? new URL(request.url).origin;
  const eventUrl = `${baseUrl}/events/${event.id}`;
  const location = [event.fixedPlaceName, event.fixedPlaceAddress]
    .filter((value): value is string => Boolean(value && value.trim().length > 0))
    .join(" ");

  const descriptionParts = [
    event.comment?.trim() ? event.comment.trim() : null,
    `詳細ページ: ${eventUrl}`,
  ].filter((value): value is string => Boolean(value));

  const icsBody = createIcsBody({
    uid: `${event.id}@meet-moc`,
    summary: event.purpose,
    description: descriptionParts.join("\n\n"),
    location,
    url: eventUrl,
    startsAt,
    endsAt,
  });

  const fileName = `event-${event.id}.ics`;
  const encodedFileName = encodeURIComponent(fileName);

  return new NextResponse(icsBody, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
