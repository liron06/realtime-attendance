import { cookies, headers } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
const cookieName = "rt_csrf";
export async function csrfToken() {
  const jar = await cookies();
  let value = jar.get(cookieName)?.value;
  if (!value) {
    value = randomBytes(32).toString("base64url");
    jar.set(cookieName, value, { httpOnly: true, secure: env().NODE_ENV === "production", sameSite: "strict", path: "/" });
  }
  return value;
}
export async function assertCsrf(request: Request) {
  const cookie = (await cookies()).get(cookieName)?.value ?? "";
  const supplied = request.headers.get("x-csrf-token") ?? "";
  const origin = (await headers()).get("origin");
  if (origin && new URL(origin).origin !== new URL(env().APP_URL).origin) throw new Error("CSRF");
  const a = Buffer.from(cookie); const b = Buffer.from(supplied);
  if (!cookie || a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("CSRF");
}
