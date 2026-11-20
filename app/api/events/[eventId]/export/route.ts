import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { activeParticipations, matchParticipationCheckIns } from "@/lib/participations";

const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    await requireSession("BOARD");
    const event = await db.eventCache.findUnique({
      where: { congressusEventId: Number((await params).eventId) },
      include: {
        participations: true,
        checkIns: { include: { member: true, scanner: true } },
      },
    });
    if (!event) return new NextResponse("Niet gevonden", { status: 404 });

    const registrations = activeParticipations(event.participationMode, event.participations);
    const matchedCheckInIds = new Set([...matchParticipationCheckIns(registrations, event.checkIns).values()].map(checkIn => checkIn.id));
    const rows = [
      ["Naam", "Lidnummer", "Inchecktijd", "Methode", "Bestuurslid", "Synchronisatie", "Aanmelding", "Reden"],
      ...event.checkIns.map(checkIn => [
        checkIn.member.name,
        checkIn.member.memberNumber,
        checkIn.checkedInAt.toISOString(),
        checkIn.method,
        checkIn.scanner.name,
        checkIn.syncStatus,
        checkIn.exception ? "Uitzondering" : matchedCheckInIds.has(checkIn.id) ? "Geldige aanmelding" : "Historisch / niet actief",
        checkIn.reason,
      ]),
    ];
    const csv = "\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n");
    return new NextResponse(csv, { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aanwezigheid-${event.congressusEventId}.csv"`,
      "Cache-Control": "no-store",
    } });
  } catch {
    return new NextResponse("Geen toegang", { status: 403 });
  }
}
