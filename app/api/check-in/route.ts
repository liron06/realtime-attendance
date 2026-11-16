import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import { assertCsrf, CsrfError } from "@/lib/csrf";
import { checkIn, CheckInError } from "@/lib/check-in";
import { rateLimit } from "@/lib/rate-limit";

const input = z.object({ eventId: z.number().int().positive(), method: z.enum(["CAMERA", "USB", "MANUAL"]), qrToken: z.string().max(4096).optional(), memberId: z.string().max(128).optional(), reason: z.string().max(500).optional(), allowException: z.boolean().optional() });

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession("BOARD");
    await assertCsrf(request);
    const limit = await rateLimit(`scan:${session.userId}`, 30, 60);
    if (!limit.allowed) return NextResponse.json({ code: "RATE_LIMIT", message: "Te veel scans. Wacht even en probeer opnieuw." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
    const body = input.parse(await request.json());
    const result = await checkIn({ eventCongressusId: body.eventId, scannerId: session.userId, method: body.method, qrToken: body.qrToken, memberId: body.memberId, reason: body.reason, allowException: body.allowException });
    return NextResponse.json({ ok: true, message: `Welkom, ${result.member.name}! Je bent ingecheckt.`, syncStatus: "PENDING", ...result });
  } catch (error) {
    if (error instanceof CsrfError) return NextResponse.json({ code: "CSRF_INVALID", message: "Ongeldig beveiligingstoken. Vernieuw de pagina." }, { status: 403 });
    if (error instanceof CheckInError) return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ code: "INVALID_INPUT", message: "De invoer is ongeldig." }, { status: 400 });
    return NextResponse.json({ code: "ERROR", message: "Inchecken is nu niet gelukt. Probeer het opnieuw." }, { status: 500 });
  }
}
