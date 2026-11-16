import { SignJWT, jwtVerify, errors } from "jose";
import { env } from "@/lib/env";
const key = () => new TextEncoder().encode(env().QR_SECRET);
const issuer = "realtime-attendance:qr";

export async function createQrToken(memberId: string, now = new Date()) {
  return new SignJWT({ memberId, purpose: "check-in" }).setProtectedHeader({ alg: "HS256" }).setIssuer(issuer).setAudience("realtime-scanner").setIssuedAt(Math.floor(now.getTime()/1000)).setExpirationTime(Math.floor(now.getTime()/1000) + 75).setJti(crypto.randomUUID()).sign(key());
}
export async function verifyQrToken(token: string, now = new Date()) {
  try {
    const { payload } = await jwtVerify(token, key(), { issuer, audience: "realtime-scanner", currentDate: now, clockTolerance: 15, algorithms: ["HS256"] });
    if (payload.purpose !== "check-in" || typeof payload.memberId !== "string" || !payload.jti) throw new Error("INVALID_QR");
    return { memberId: payload.memberId, jti: payload.jti };
  } catch (error) {
    if (error instanceof errors.JWTExpired) throw new Error("EXPIRED_QR");
    throw new Error("INVALID_QR");
  }
}
