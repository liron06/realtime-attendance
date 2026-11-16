import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { assertCsrf, CsrfError } from "@/lib/csrf";
import { CongressusError } from "@/lib/congressus/client";
import { logSyncDiagnostic, syncEvents, type SyncPhase } from "@/lib/event-sync";

function congressusResponse(error: CongressusError, requestId: string) {
  const responses: Record<string, { status: number; message: string }> = {
    CONGRESSUS_NOT_CONFIGURED: { status: 503, message: "Congressus-synchronisatie is niet geconfigureerd." },
    CONGRESSUS_UNAUTHORIZED: { status: 502, message: "De Congressus API-key is ongeldig of verlopen." },
    CONGRESSUS_FORBIDDEN: { status: 502, message: "De Congressus API-key heeft onvoldoende rechten voor activiteiten of deelnames." },
    CONGRESSUS_NOT_FOUND: { status: 502, message: "Een Congressus-activiteit is niet toegankelijk met deze API-key." },
    CONGRESSUS_RATE_LIMITED: { status: 503, message: "Congressus heeft tijdelijk te veel verzoeken ontvangen. Probeer het later opnieuw." },
    CONGRESSUS_TIMEOUT: { status: 504, message: "Congressus reageerde niet op tijd. Probeer het opnieuw." },
    CONGRESSUS_NETWORK_ERROR: { status: 502, message: "Congressus is momenteel niet bereikbaar." },
    CONGRESSUS_SCHEMA_ERROR: { status: 502, message: "Het antwoord van Congressus heeft een onverwachte structuur." },
    CONGRESSUS_INVALID_JSON: { status: 502, message: "Congressus gaf een ongeldig antwoord terug." },
    CONGRESSUS_PAGINATION_ERROR: { status: 502, message: "De paginering van Congressus is ongeldig." },
    CONGRESSUS_SERVER_ERROR: { status: 502, message: "Congressus heeft een tijdelijke serverfout." },
    CONGRESSUS_HTTP_ERROR: { status: 502, message: "Het Congressus-verzoek is geweigerd." }
  };
  const response = responses[error.code] ?? responses.CONGRESSUS_HTTP_ERROR;
  const headers = error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined;
  return NextResponse.json({ ok: false, code: error.code, message: response.message, requestId }, { status: response.status, headers });
}

function logFailure(requestId: string, phase: SyncPhase, errorCode: string, httpStatus: number, startedAt: number) {
  logSyncDiagnostic({ requestId, phase, errorCode, httpStatus, durationMs: Date.now() - startedAt });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  try {
    try {
      await requireSession("BOARD");
    } catch (error) {
      const forbidden = error instanceof Error && error.message === "FORBIDDEN";
      const status = forbidden ? 403 : 401;
      const code = forbidden ? "SYNC_FORBIDDEN" : "SYNC_AUTH_REQUIRED";
      logFailure(requestId, "authorization", code, status, startedAt);
      return NextResponse.json({ ok: false, code, message: forbidden ? "Je hebt geen bestuursrechten." : "Log opnieuw in om te synchroniseren.", requestId }, { status });
    }
    try {
      await assertCsrf(request);
    } catch (error) {
      if (!(error instanceof CsrfError)) throw error;
      logFailure(requestId, "csrf", "SYNC_CSRF_INVALID", 403, startedAt);
      return NextResponse.json({ ok: false, code: "SYNC_CSRF_INVALID", message: "Het beveiligingstoken is verlopen. Vernieuw de pagina.", requestId }, { status: 403 });
    }

    const result = await syncEvents(requestId);
    if (!result.ok) return NextResponse.json({ ...result, code: "SYNC_PARTIAL", message: `${result.events} activiteiten zijn bijgewerkt; ${result.eventsFailed} zijn mislukt${result.eventsSkipped ? ` en ${result.eventsSkipped} zijn overgeslagen` : ""}.`, requestId }, { status: 207 });
    return NextResponse.json({ ...result, message: `${result.events} activiteiten en ${result.participations} deelnames zijn bijgewerkt.`, requestId });
  } catch (error) {
    if (error instanceof CongressusError) return congressusResponse(error, requestId);
    logFailure(requestId, "complete", "SYNC_UNEXPECTED_ERROR", 500, startedAt);
    return NextResponse.json({ ok: false, code: "SYNC_UNEXPECTED_ERROR", message: "Synchronisatie is onverwacht mislukt.", requestId }, { status: 500 });
  }
}
