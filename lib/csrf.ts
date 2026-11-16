import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const csrfCookieName = "rt_csrf";
const csrfMaxAge = 8 * 60 * 60;

export class CsrfError extends Error {
  constructor() { super("CSRF_VALIDATION_FAILED"); this.name = "CsrfError"; }
}

export function createCsrfToken() {
  return randomBytes(32).toString("base64url");
}

export function isCsrfToken(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function csrfCookieOptions(production = env().NODE_ENV === "production") {
  return { httpOnly: true, secure: production, sameSite: "strict" as const, path: "/", maxAge: csrfMaxAge, priority: "high" as const };
}

export function validateCsrfToken(cookieValue: string | undefined, suppliedValue: string | null, origin: string | null, appUrl: string) {
  if (origin) {
    try { if (new URL(origin).origin !== new URL(appUrl).origin) throw new CsrfError(); }
    catch (error) { if (error instanceof CsrfError) throw error; throw new CsrfError(); }
  }
  if (!isCsrfToken(cookieValue) || !isCsrfToken(suppliedValue)) throw new CsrfError();
  const cookieBuffer = Buffer.from(cookieValue);
  const suppliedBuffer = Buffer.from(suppliedValue);
  if (cookieBuffer.length !== suppliedBuffer.length || !timingSafeEqual(cookieBuffer, suppliedBuffer)) throw new CsrfError();
}

export async function assertCsrf(request: Request) {
  const cookieValue = (await cookies()).get(csrfCookieName)?.value;
  validateCsrfToken(cookieValue, request.headers.get("x-csrf-token"), request.headers.get("origin"), env().APP_URL);
}
