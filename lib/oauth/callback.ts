import type { Role } from "@prisma/client";
import type { ZodIssue } from "zod";
import { memberPageSchema, oauthTokenSchema, userInfoSchema, type UserInfo } from "@/lib/congressus/types";

export type OAuthFailureStep = "state_validation" | "authorization" | "configuration" | "token_exchange" | "userinfo" | "userinfo_schema" | "members_api" | "member_mapping" | "database_upsert" | "session_creation" | "callback";
export type OAuthFailureCode =
  | "OAUTH_STATE_INVALID" | "OAUTH_PROVIDER_DENIED" | "OAUTH_CODE_MISSING" | "OAUTH_CONFIG_INVALID" | "OAUTH_UNEXPECTED"
  | "OAUTH_TOKEN_REQUEST_FAILED" | "OAUTH_TOKEN_HTTP_ERROR" | "OAUTH_TOKEN_SCHEMA_INVALID"
  | "OAUTH_USERINFO_REQUEST_FAILED" | "OAUTH_USERINFO_HTTP_ERROR" | "OAUTH_USERINFO_SCHEMA_INVALID" | "OAUTH_MEMBER_INACTIVE"
  | "OAUTH_MEMBERS_API_REQUEST_FAILED" | "OAUTH_MEMBERS_API_HTTP_ERROR" | "OAUTH_MEMBERS_API_SCHEMA_INVALID"
  | "OAUTH_MEMBER_USERNAME_MISSING" | "OAUTH_MEMBER_NOT_FOUND" | "OAUTH_MEMBER_AMBIGUOUS"
  | "OAUTH_DATABASE_UPSERT_FAILED" | "OAUTH_SESSION_CREATION_FAILED";

export type SafeSchemaIssue = { path: string; code: string; expected?: string };

export class OAuthCallbackError extends Error {
  constructor(public code: OAuthFailureCode, public step: OAuthFailureStep, public httpStatus?: number, public schemaIssues: readonly SafeSchemaIssue[] = []) {
    super(code);
    this.name = "OAuthCallbackError";
  }
}

const safeExpectedTypes = new Set(["string", "number", "boolean", "object", "array", "record", "null", "undefined", "url", "email", "uuid", "date", "datetime"]);
function safePath(path: PropertyKey[]) {
  if (path.length === 0) return "<root>";
  return path.map(part => typeof part === "number" ? String(part) : typeof part === "string" ? part.slice(0, 80).replace(/[^a-zA-Z0-9_-]/g, "_") : "unknown").join(".");
}
export function safeSchemaIssues(issues: readonly ZodIssue[]): SafeSchemaIssue[] {
  return issues.slice(0, 20).map(issue => {
    const candidate = issue.code === "invalid_type" ? issue.expected : issue.code === "invalid_format" ? issue.format : undefined;
    const expected = candidate && safeExpectedTypes.has(candidate) ? candidate : undefined;
    return { path: safePath(issue.path), code: issue.code, ...(expected ? { expected } : {}) };
  });
}

export type OAuthConfig = {
  baseUrl: string; apiBaseUrl: string; clientId: string; clientSecret: string;
  apiKey: string; boardGroupSlug?: string; boardUserIds: string;
};
export type OAuthUserRecord = { id: string; role: Role; congressusUserId: string };
export type OAuthUserInput = {
  congressusUserId: string; congressusMemberId: number; username: string; name: string;
  firstName?: string; pictureUrl?: string; memberStatus?: string; active: true; role: Role;
};
export type OAuthDependencies = {
  fetch: typeof fetch;
  upsertUser(input: OAuthUserInput): Promise<OAuthUserRecord>;
  createSession(user: OAuthUserRecord): Promise<void>;
};

function roleFor(info: UserInfo, slug: string | undefined, allowlistValue: string): Role {
  const allowlist = new Set(allowlistValue.split(",").map(value => value.trim()).filter(Boolean));
  // Een ontbrekende/onbekende slug of ontbrekende groups-scope verlaagt alleen
  // naar MEMBER en blokkeert de login nooit. De allowlist blijft een fallback.
  return (slug && info.groups?.[slug]?.active === true) || allowlist.has(info.user_id) ? "BOARD" : "MEMBER";
}

async function parseJson(response: Response, code: OAuthFailureCode, step: OAuthFailureStep) {
  try { return await response.json(); } catch { throw new OAuthCallbackError(code, step, response.status); }
}

export async function completeOAuthLogin(code: string, config: OAuthConfig, dependencies: OAuthDependencies) {
  let tokenResponse: Response;
  try {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    tokenResponse = await dependencies.fetch(`${config.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code }),
      signal: AbortSignal.timeout(10_000), cache: "no-store"
    });
  } catch { throw new OAuthCallbackError("OAUTH_TOKEN_REQUEST_FAILED", "token_exchange"); }
  if (!tokenResponse.ok) throw new OAuthCallbackError("OAUTH_TOKEN_HTTP_ERROR", "token_exchange", tokenResponse.status);
  const tokenResult = oauthTokenSchema.safeParse(await parseJson(tokenResponse, "OAUTH_TOKEN_SCHEMA_INVALID", "token_exchange"));
  if (!tokenResult.success) throw new OAuthCallbackError("OAUTH_TOKEN_SCHEMA_INVALID", "token_exchange", tokenResponse.status);

  let userinfoResponse: Response;
  try {
    userinfoResponse = await dependencies.fetch(`${config.baseUrl}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${tokenResult.data.access_token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000), cache: "no-store"
    });
  } catch { throw new OAuthCallbackError("OAUTH_USERINFO_REQUEST_FAILED", "userinfo"); }
  if (!userinfoResponse.ok) throw new OAuthCallbackError("OAUTH_USERINFO_HTTP_ERROR", "userinfo", userinfoResponse.status);
  const infoResult = userInfoSchema.safeParse(await parseJson(userinfoResponse, "OAUTH_USERINFO_SCHEMA_INVALID", "userinfo_schema"));
  if (!infoResult.success) throw new OAuthCallbackError("OAUTH_USERINFO_SCHEMA_INVALID", "userinfo_schema", userinfoResponse.status, safeSchemaIssues(infoResult.error.issues));
  const info = infoResult.data;
  if (!info.is_active) throw new OAuthCallbackError("OAUTH_MEMBER_INACTIVE", "userinfo");
  if (!info.username) throw new OAuthCallbackError("OAUTH_MEMBER_USERNAME_MISSING", "member_mapping");

  const memberUrl = new URL(`${config.apiBaseUrl}/members`);
  memberUrl.searchParams.append("username", info.username);
  memberUrl.searchParams.set("page", "1");
  memberUrl.searchParams.set("page_size", "2");
  let membersResponse: Response;
  try {
    membersResponse = await dependencies.fetch(memberUrl, {
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000), cache: "no-store"
    });
  } catch { throw new OAuthCallbackError("OAUTH_MEMBERS_API_REQUEST_FAILED", "members_api"); }
  if (!membersResponse.ok) throw new OAuthCallbackError("OAUTH_MEMBERS_API_HTTP_ERROR", "members_api", membersResponse.status);
  const membersResult = memberPageSchema.safeParse(await parseJson(membersResponse, "OAUTH_MEMBERS_API_SCHEMA_INVALID", "members_api"));
  if (!membersResult.success) throw new OAuthCallbackError("OAUTH_MEMBERS_API_SCHEMA_INVALID", "members_api", membersResponse.status);
  const exact = membersResult.data.data.filter(member => member.username === info.username);
  if (exact.length === 0) throw new OAuthCallbackError("OAUTH_MEMBER_NOT_FOUND", "member_mapping");
  if (exact.length > 1) throw new OAuthCallbackError("OAUTH_MEMBER_AMBIGUOUS", "member_mapping");

  const member = exact[0];
  let user: OAuthUserRecord;
  try {
    user = await dependencies.upsertUser({ congressusUserId: info.user_id, congressusMemberId: member.id, username: info.username, name: info.name, firstName: member.first_name ?? undefined, pictureUrl: info.picture ?? undefined, memberStatus: info.member_status ?? undefined, active: true, role: roleFor(info, config.boardGroupSlug, config.boardUserIds) });
  } catch { throw new OAuthCallbackError("OAUTH_DATABASE_UPSERT_FAILED", "database_upsert"); }
  try { await dependencies.createSession(user); }
  catch { throw new OAuthCallbackError("OAUTH_SESSION_CREATION_FAILED", "session_creation"); }
  return user;
}

export function logOAuthCallbackFailure(error: OAuthCallbackError, requestId: string) {
  // Alleen vaste codes, stap, upstreamstatus en een willekeurig correlatie-ID.
  // Nooit error.message/cause of upstreambody loggen: die kunnen PII bevatten.
  console.error("[oauth-callback]", JSON.stringify({ event: "oauth_callback_failed", requestId, code: error.code, step: error.step, ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}), ...(error.schemaIssues.length ? { schemaIssues: error.schemaIssues } : {}) }));
}
