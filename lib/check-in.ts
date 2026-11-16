import { Prisma, ScanMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyQrToken } from "@/lib/qr";

export class CheckInError extends Error { constructor(public code: string, message: string, public status=400) { super(message); } }
type Input = { eventCongressusId: number; scannerId: string; method: ScanMethod; qrToken?: string; memberId?: string; reason?: string; allowException?: boolean };

export async function checkIn(input: Input) {
  const scanner = await db.user.findUnique({ where: { id: input.scannerId } });
  if (!scanner || scanner.role !== "BOARD" || !scanner.active) throw new CheckInError("FORBIDDEN", "Je hebt geen bestuursrechten.", 403);
  const token = input.qrToken ? await verifyQrToken(input.qrToken).catch(() => { throw new CheckInError("INVALID_QR", "Deze QR-code is ongeldig of verlopen."); }) : null;
  const memberId = token?.memberId ?? input.memberId;
  if (!memberId) throw new CheckInError("MEMBER_REQUIRED", "Selecteer een lid.");
  const [member, event] = await Promise.all([db.user.findUnique({ where: { id: memberId } }), db.eventCache.findUnique({ where: { congressusEventId: input.eventCongressusId } })]);
  if (!member?.active) throw new CheckInError("INACTIVE", "Dit lid heeft geen actief lidmaatschap.");
  if (!event) throw new CheckInError("EVENT_NOT_FOUND", "Deze activiteit bestaat niet.", 404);
  if (event.closedAt) throw new CheckInError("EVENT_CLOSED", "Deze activiteit is afgesloten.", 409);
  if (!["single", "ticketing", "none"].includes(event.participationMode)) throw new CheckInError("UNKNOWN_PARTICIPATION_MODE", "De deelnamevorm van deze activiteit is onbekend. Synchroniseer opnieuw of controleer de activiteit in Congressus voordat je incheckt.", 409);
  const participation = member.congressusMemberId ? await db.eventParticipation.findFirst({ where: { eventId: event.id, congressusMemberId: member.congressusMemberId } }) : null;
  if (!participation && !input.allowException) throw new CheckInError("NOT_REGISTERED", "Dit lid is niet aangemeld voor deze activiteit.", 409);
  if (!participation && (!input.reason || input.reason.trim().length < 3)) throw new CheckInError("REASON_REQUIRED", "Een reden is verplicht voor deze uitzondering.");
  if (participation && !["approved", "participating", "subscribed"].includes(participation.status.toLowerCase())) throw new CheckInError("INVALID_PARTICIPATION", "Deze aanmelding is niet geldig voor inchecken.", 409);
  const tickets = participation?.tickets as Array<{id?:number;name?:string|null;email?:string|null}> | null;
  let ticketId: number | undefined;
  if (event.participationMode === "ticketing" && tickets && tickets.length > 1) {
    const own = tickets.filter((ticket): ticket is typeof ticket & { id: number } => Number.isInteger(ticket.id) && ticket.name?.toLocaleLowerCase("nl") === member.name.toLocaleLowerCase("nl"));
    if (own.length !== 1) throw new CheckInError("AMBIGUOUS_TICKET", "Meerdere tickets gevonden. Kies het juiste ticket handmatig.", 409);
    ticketId = own[0].id;
  } else if (tickets?.length === 1 && Number.isInteger(tickets[0].id)) ticketId = tickets[0].id;
  try {
    return await db.$transaction(async tx => {
      const checkIn = await tx.checkIn.create({ data: { eventId: event.id, memberId: member.id, scannerId: scanner.id, method: input.method, participationId: participation?.congressusParticipationId, ticketId, exception: !participation, reason: input.reason?.trim(), syncStatus: participation ? "PENDING" : "NOT_APPLICABLE" } });
      if (participation) await tx.syncOutbox.create({ data: { checkInId: checkIn.id, eventCongressusId: event.congressusEventId, participationId: participation.congressusParticipationId, ticketId, payload: { status_presence: "present" } } });
      await tx.auditLog.create({ data: { actorId: scanner.id, action: "CHECK_IN_CREATED", entityType: "CheckIn", entityId: checkIn.id, after: { memberId: member.id, eventId: event.id, method: input.method, exception: !participation } } });
      return { checkIn, member: { id: member.id, name: member.name }, synced: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.checkIn.findUnique({ where: { eventId_memberId: { eventId: event.id, memberId: member.id } } });
      throw new CheckInError("ALREADY_CHECKED_IN", `${member.name} is al ingecheckt${existing ? ` om ${existing.checkedInAt.toLocaleTimeString("nl-NL", { hour:"2-digit", minute:"2-digit", timeZone:"Europe/Amsterdam" })}` : ""}.`, 409);
    }
    throw error;
  }
}
