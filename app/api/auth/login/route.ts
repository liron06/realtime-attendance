import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { env, isDemo } from "@/lib/env";
export async function GET() {
  const config = env();
  if (!config.CONGRESSUS_CLIENT_ID || !config.CONGRESSUS_REDIRECT_URI) {
    if (isDemo()) return NextResponse.redirect(new URL("/api/auth/demo?role=member", config.APP_URL));
    return NextResponse.redirect(new URL("/?fout=configuratie", config.APP_URL));
  }
  const state = randomBytes(32).toString("base64url");
  (await cookies()).set("rt_oauth_state", state, { httpOnly:true, secure:config.NODE_ENV==="production", sameSite:"lax", path:"/api/auth/callback", maxAge:600 });
  const url = new URL("/oauth/authorize", config.CONGRESSUS_BASE_URL);
  url.search = new URLSearchParams({ response_type:"code", client_id:config.CONGRESSUS_CLIENT_ID, redirect_uri:config.CONGRESSUS_REDIRECT_URI, scope:`openid profile${config.CONGRESSUS_BOARD_GROUP_SLUG ? " groups" : ""}`, state }).toString();
  return NextResponse.redirect(url);
}
