import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/session";
import { createCsrfToken, csrfCookieName, csrfCookieOptions, isCsrfToken } from "@/lib/csrf";

export async function GET() {
  try {
    await requireSession();
    const jar = await cookies();
    let token = jar.get(csrfCookieName)?.value;
    if (!isCsrfToken(token)) {
      token = createCsrfToken();
      jar.set(csrfCookieName, token, csrfCookieOptions());
    }
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } });
  } catch {
    return NextResponse.json({ message: "Niet ingelogd." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
