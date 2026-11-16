import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CongressusError, listEvents, listParticipations } from "@/lib/congressus/client";
import type { CongressusEvent, Participation } from "@/lib/congressus/types";

export type SyncPhase = "authorization" | "csrf" | "events_fetch" | "participations_fetch" | "database" | "complete";
export type SyncDiagnostic = {
  requestId: string;
  phase: SyncPhase;
  errorCode?: string;
  httpStatus?: number;
  schemaIssues?: readonly { path: string; code: string }[];
  durationMs?: number;
  eventsProcessed?: number;
  eventsFailed?: number;
  eventsSkipped?: number;
  participationsProcessed?: number;
};

export function logSyncDiagnostic(diagnostic: SyncDiagnostic) {
  const method = diagnostic.errorCode ? console.error : console.info;
  method("[congressus-sync]", JSON.stringify(diagnostic));
}

export function normalizeCongressusDate(value: string) {
  return new Date(/Z|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
}

type SyncDependencies = {
  listEvents: typeof listEvents;
  listParticipations: typeof listParticipations;
  persistEvent: (event: CongressusEvent, participations: Participation[]) => Promise<number>;
};

async function persistEvent(event: CongressusEvent, participations: Participation[]) {
  return db.$transaction(async tx => {
    const cached = await tx.eventCache.upsert({
      where: { congressusEventId: event.id },
      create: {
        congressusEventId: event.id, name: event.name, startsAt: normalizeCongressusDate(event.start), endsAt: normalizeCongressusDate(event.end),
        location: event.location, participationMode: event.participation_mode, registrationCount: event.num_tickets_sold ?? 0,
        payload: event as Prisma.InputJsonValue
      },
      update: {
        name: event.name, startsAt: normalizeCongressusDate(event.start), endsAt: normalizeCongressusDate(event.end), location: event.location,
        participationMode: event.participation_mode, registrationCount: event.num_tickets_sold ?? 0, payload: event as Prisma.InputJsonValue, syncedAt: new Date()
      }
    });
    for (const participation of participations) {
      await tx.eventParticipation.upsert({
        where: { congressusParticipationId: participation.id },
        create: {
          congressusParticipationId: participation.id, eventId: cached.id, congressusMemberId: participation.member_id,
          memberName: participation.addressee, memberNumber: participation.member?.username, status: participation.status,
          tickets: participation.tickets as Prisma.InputJsonValue
        },
        update: {
          eventId: cached.id, congressusMemberId: participation.member_id, memberName: participation.addressee,
          memberNumber: participation.member?.username, status: participation.status, tickets: participation.tickets as Prisma.InputJsonValue, syncedAt: new Date()
        }
      });
    }
    return participations.length;
  }, { maxWait: 10_000, timeout: 60_000 });
}

const defaultDependencies: SyncDependencies = { listEvents, listParticipations, persistEvent };

function errorDetails(error: unknown, phase: SyncPhase) {
  if (error instanceof CongressusError) return { errorCode: error.code, httpStatus: error.status, schemaIssues: error.schemaIssues };
  return { errorCode: phase === "database" ? "SYNC_DATABASE_ERROR" : "SYNC_UNEXPECTED_ERROR", httpStatus: phase === "database" ? 500 : undefined, schemaIssues: [] };
}

export async function syncEvents(requestId: string, dependencies: SyncDependencies = defaultDependencies) {
  const startedAt = Date.now();
  let events: CongressusEvent[];
  try {
    events = await dependencies.listEvents();
    logSyncDiagnostic({ requestId, phase: "events_fetch", durationMs: Date.now() - startedAt, eventsProcessed: events.length });
  } catch (error) {
    logSyncDiagnostic({ requestId, phase: "events_fetch", durationMs: Date.now() - startedAt, ...errorDetails(error, "events_fetch") });
    throw error;
  }

  let eventsProcessed = 0;
  let eventsFailed = 0;
  let participationsProcessed = 0;
  const failures: Array<{ errorCode: string; httpStatus?: number }> = [];

  for (const event of events) {
    const eventStartedAt = Date.now();
    let phase: SyncPhase = "participations_fetch";
    try {
      const participations = event.participation_mode === "none" ? [] : await dependencies.listParticipations(event.id);
      phase = "database";
      participationsProcessed += await dependencies.persistEvent(event, participations);
      eventsProcessed++;
    } catch (error) {
      eventsFailed++;
      const details = errorDetails(error, phase);
      failures.push({ errorCode: details.errorCode, ...(details.httpStatus ? { httpStatus: details.httpStatus } : {}) });
      logSyncDiagnostic({ requestId, phase, durationMs: Date.now() - eventStartedAt, eventsProcessed, eventsFailed, participationsProcessed, ...details });
      if (error instanceof CongressusError && error.code === "CONGRESSUS_RATE_LIMITED") break;
    }
  }

  const eventsSkipped = events.length - eventsProcessed - eventsFailed;
  const result = { ok: eventsFailed === 0, events: eventsProcessed, eventsFailed, eventsSkipped, participations: participationsProcessed, failures };
  logSyncDiagnostic({ requestId, phase: "complete", ...(eventsFailed ? { errorCode: "SYNC_PARTIAL" } : {}), durationMs: Date.now() - startedAt, eventsProcessed, eventsFailed, eventsSkipped, participationsProcessed });
  return result;
}
