import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { assertCsrf, CsrfError } from "@/lib/csrf";
import { syncEvents } from "@/lib/event-sync";

export async function POST(request: Request) {
  try {
    await requireSession("BOARD");
    await assertCsrf(request);
    return NextResponse.json(await syncEvents());
  } catch (error) {
    if (error instanceof CsrfError) return NextResponse.json({ message: "Ongeldig beveiligingstoken." }, { status: 403 });
    return NextResponse.json({ message: "Synchronisatie mislukt." }, { status: 500 });
  }
}
