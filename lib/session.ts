import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

export type Session = { userId: string; role: "MEMBER" | "BOARD"; congressusUserId: string };
const name = "rt_session";
const key = () => new TextEncoder().encode(env().SESSION_SECRET);

export async function createSession(value: Session) {
  const token = await new SignJWT(value).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").setAudience("realtime-attendance").setIssuer("realtime-attendance").sign(key());
  (await cookies()).set(name, token, { httpOnly: true, secure: env().NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 3600 });
}
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(name)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience: "realtime-attendance", issuer: "realtime-attendance" });
    if (typeof payload.userId !== "string" || (payload.role !== "MEMBER" && payload.role !== "BOARD") || typeof payload.congressusUserId !== "string") return null;
    return { userId: payload.userId, role: payload.role, congressusUserId: payload.congressusUserId };
  } catch { return null; }
}
export async function destroySession() { (await cookies()).delete(name); }
export async function requireSession(role?: "BOARD") {
  const session = await getSession();
  if (!session || (role && session.role !== role)) throw new Error(role ? "FORBIDDEN" : "UNAUTHORIZED");
  return session;
}
