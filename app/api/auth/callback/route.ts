import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { completeOAuthLogin, logOAuthCallbackFailure, OAuthCallbackError } from "@/lib/oauth/callback";

function safeRedirect(error: string) {
  return NextResponse.redirect(new URL(`/?fout=${error}`, env().APP_URL));
}

function publicError(error: OAuthCallbackError) {
  if (error.code === "OAUTH_MEMBER_INACTIVE") return "inactief-lid";
  if (["OAUTH_MEMBER_USERNAME_MISSING", "OAUTH_MEMBER_NOT_FOUND", "OAUTH_MEMBER_AMBIGUOUS"].includes(error.code)) return "account-koppeling";
  if (error.step === "members_api") return "ledenservice-onbeschikbaar";
  if (error.step === "database_upsert") return "account-opslaan-mislukt";
  if (error.step === "session_creation") return "sessie-mislukt";
  return "authenticatie-mislukt";
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  const config = env();
  const url = new URL(request.url);
  const jar = await cookies();
  const expected = jar.get("rt_oauth_state")?.value;
  jar.delete("rt_oauth_state");
  const state = url.searchParams.get("state") ?? "";
  const expectedBuffer = Buffer.from(expected ?? "");
  const stateBuffer = Buffer.from(state);
  if (!expected || expectedBuffer.length !== stateBuffer.length || !timingSafeEqual(expectedBuffer, stateBuffer)) {
    const error = new OAuthCallbackError("OAUTH_STATE_INVALID", "state_validation");
    logOAuthCallbackFailure(error, requestId);
    return safeRedirect("ongeldige-state");
  }
  if (url.searchParams.has("error")) {
    const error = new OAuthCallbackError("OAUTH_PROVIDER_DENIED", "authorization");
    logOAuthCallbackFailure(error, requestId);
    return safeRedirect("toegang-geweigerd");
  }
  const code = url.searchParams.get("code");
  if (!code) {
    const error = new OAuthCallbackError("OAUTH_CODE_MISSING", "authorization");
    logOAuthCallbackFailure(error, requestId);
    return safeRedirect("authenticatie-mislukt");
  }
  if (!config.CONGRESSUS_CLIENT_ID || !config.CONGRESSUS_CLIENT_SECRET || !config.CONGRESSUS_REDIRECT_URI || !config.CONGRESSUS_API_KEY) {
    const error = new OAuthCallbackError("OAUTH_CONFIG_INVALID", "configuration");
    logOAuthCallbackFailure(error, requestId);
    return safeRedirect("configuratie");
  }

  try {
    await completeOAuthLogin(code, {
      baseUrl: config.CONGRESSUS_BASE_URL.replace(/\/$/, ""),
      apiBaseUrl: config.CONGRESSUS_API_BASE_URL.replace(/\/$/, ""),
      clientId: config.CONGRESSUS_CLIENT_ID,
      clientSecret: config.CONGRESSUS_CLIENT_SECRET,
      apiKey: config.CONGRESSUS_API_KEY,
      boardGroupSlug: config.CONGRESSUS_BOARD_GROUP_SLUG,
      boardUserIds: config.CONGRESSUS_BOARD_USER_IDS
    }, {
      fetch,
      upsertUser: input => db.user.upsert({
        where: { congressusUserId: input.congressusUserId },
        create: input,
        update: input
      }),
      createSession: user => createSession({ userId: user.id, role: user.role, congressusUserId: user.congressusUserId })
    });
    return NextResponse.redirect(new URL("/dashboard", config.APP_URL));
  } catch (caught) {
    const error = caught instanceof OAuthCallbackError ? caught : new OAuthCallbackError("OAUTH_UNEXPECTED", "callback");
    logOAuthCallbackFailure(error, requestId);
    return safeRedirect(publicError(error));
  }
}
