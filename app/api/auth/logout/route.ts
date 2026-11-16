import { NextResponse } from "next/server";
import { destroySession, requireSession } from "@/lib/session";
import { assertCsrf, CsrfError } from "@/lib/csrf";

export async function POST(request: Request) {
  try {
    await requireSession();
    await assertCsrf(request);
    await destroySession();
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CsrfError) return NextResponse.json({ message: "Ongeldig beveiligingstoken." }, { status: 403 });
    return NextResponse.json({ message: "Niet ingelogd." }, { status: 401 });
  }
}
