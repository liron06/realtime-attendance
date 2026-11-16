import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeOAuthLogin, logOAuthCallbackFailure, OAuthCallbackError, type OAuthConfig, type OAuthDependencies } from "@/lib/oauth/callback";

const config: OAuthConfig = {
  baseUrl: "https://www.example.test", apiBaseUrl: "https://api.example.test/v30",
  clientId: "client", clientSecret: "super-secret",
  apiKey: "api-secret", boardGroupSlug: "bestuur", boardUserIds: ""
};
const token = () => Response.json({ access_token: "access-secret", token_type: "bearer" });
const userinfo = (overrides: Record<string, unknown> = {}) => Response.json({ user_id: "oauth-1", is_active: true, username: "RT001", name: "Testlid", picture: null, member_status: null, ...overrides });
const page = (data: unknown[] = [{ id: 42, username: "RT001", first_name: null }]) => Response.json({ has_prev: false, prev_num: null, has_next: false, next_num: null, data, total: data.length });

function setup(responses: Array<Response | Error>, options: { upsertError?: boolean; sessionError?: boolean } = {}) {
  let index = 0;
  const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => { void args; const value = responses[index++]; if (value instanceof Error) throw value; return value; });
  const upsertUser = vi.fn(async input => {
    if (options.upsertError) throw new Error("database bevat mogelijk gevoelige details");
    return { id: "local-1", role: input.role, congressusUserId: input.congressusUserId };
  });
  const createSession = vi.fn(async () => { if (options.sessionError) throw new Error("cookie mislukt"); });
  return { dependencies: { fetch: fetchMock as unknown as typeof fetch, upsertUser, createSession } satisfies OAuthDependencies, fetchMock, upsertUser, createSession };
}

async function failure(responses: Array<Response | Error>, code: string, options?: { upsertError?: boolean; sessionError?: boolean }) {
  const { dependencies } = setup(responses, options);
  await expect(completeOAuthLogin("authorization-code", config, dependencies)).rejects.toMatchObject({ code });
}

describe("Congressus OAuth callback", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("classificeert een netwerkfout bij token exchange", () => failure([new Error("timeout")], "OAUTH_TOKEN_REQUEST_FAILED"));
  it("registreert de HTTP-status van een afgewezen token exchange", async () => {
    const { dependencies } = setup([Response.json({ error: "invalid_grant" }, { status: 400 })]);
    await expect(completeOAuthLogin("code", config, dependencies)).rejects.toMatchObject({ code: "OAUTH_TOKEN_HTTP_ERROR", step: "token_exchange", httpStatus: 400 });
  });
  it("weigert een tokenresponse zonder access_token", () => failure([Response.json({ token_type: "bearer" })], "OAUTH_TOKEN_SCHEMA_INVALID"));
  it("classificeert een netwerkfout bij userinfo", () => failure([token(), new Error("timeout")], "OAUTH_USERINFO_REQUEST_FAILED"));
  it("classificeert een userinfo HTTP-fout", () => failure([token(), new Response(null, { status: 401 })], "OAUTH_USERINFO_HTTP_ERROR"));
  it("classificeert een ongeldig userinfo-schema", () => failure([token(), Response.json({ user_id: "1", is_active: "yes" })], "OAUTH_USERINFO_SCHEMA_INVALID"));
  it.each([
    [{ is_active: "true" }, { path: "is_active", code: "invalid_type", expected: "boolean" }],
    [{ picture: "geen-geldige-url" }, { path: "picture", code: "invalid_format", expected: "url" }],
    [{ groups: { bestuur: { active: "ja" } } }, { path: "groups.bestuur.active", code: "invalid_type", expected: "boolean" }]
  ])("projecteert alleen veilige Zod-metadata voor userinfo %j", async (overrides, expectedIssue) => {
    const { dependencies } = setup([token(), userinfo(overrides)]);
    const error = await completeOAuthLogin("code", config, dependencies).catch(caught => caught);
    expect(error).toBeInstanceOf(OAuthCallbackError);
    expect(error).toMatchObject({ code: "OAUTH_USERINFO_SCHEMA_INVALID", schemaIssues: [expectedIssue] });
  });
  it("weigert een inactief lid expliciet", () => failure([token(), userinfo({ is_active: false })], "OAUTH_MEMBER_INACTIVE"));
  it("herkent een ontbrekende username", () => failure([token(), userinfo({ username: null })], "OAUTH_MEMBER_USERNAME_MISSING"));
  it("classificeert een netwerkfout van de leden-API", () => failure([token(), userinfo(), new Error("timeout")], "OAUTH_MEMBERS_API_REQUEST_FAILED"));
  it("registreert een leden-API status zonder responsebody te loggen", () => failure([token(), userinfo(), Response.json({ detail: "gevoelig" }, { status: 403 })], "OAUTH_MEMBERS_API_HTTP_ERROR"));
  it("classificeert een ongeldig paginatieschema", () => failure([token(), userinfo(), Response.json({ data: [], total: 0 })], "OAUTH_MEMBERS_API_SCHEMA_INVALID"));
  it("onderscheidt geen match en meerdere matches", async () => {
    await failure([token(), userinfo(), page([])], "OAUTH_MEMBER_NOT_FOUND");
    await failure([token(), userinfo(), page([{ id: 1, username: "RT001" }, { id: 2, username: "RT001" }])], "OAUTH_MEMBER_AMBIGUOUS");
  });
  it("classificeert database-upsert en sessiecreatie afzonderlijk", async () => {
    await failure([token(), userinfo(), page()], "OAUTH_DATABASE_UPSERT_FAILED", { upsertError: true });
    await failure([token(), userinfo(), page()], "OAUTH_SESSION_CREATION_FAILED", { sessionError: true });
  });
  it("accepteert nullable officiële ledenvelden en maakt zonder groups een MEMBER", async () => {
    const { dependencies, upsertUser, fetchMock } = setup([token(), userinfo(), page()]);
    await expect(completeOAuthLogin("code", config, dependencies)).resolves.toMatchObject({ role: "MEMBER" });
    expect(upsertUser).toHaveBeenCalledWith(expect.objectContaining({ congressusMemberId: 42, firstName: undefined, pictureUrl: undefined, role: "MEMBER" }));
    const tokenBody = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect([...tokenBody.keys()]).toEqual(["grant_type", "code"]);
    const memberUrl = new URL(String(fetchMock.mock.calls[2][0]));
    expect(memberUrl.pathname).toBe("/v30/members");
    expect(memberUrl.searchParams.getAll("username")).toEqual(["RT001"]);
    expect(memberUrl.searchParams.get("page")).toBe("1");
    expect(memberUrl.searchParams.get("page_size")).toBe("2");
  });
  it.each([undefined, null, ""])("accepteert een ontbrekende, null of lege profielafbeelding: %j", async picture => {
    const value = picture === undefined ? { picture: undefined } : { picture };
    const { dependencies, upsertUser } = setup([token(), userinfo(value), page()]);
    await completeOAuthLogin("code", config, dependencies);
    expect(upsertUser).toHaveBeenCalledWith(expect.objectContaining({ pictureUrl: undefined }));
  });
  it("maakt alleen een actief lid van de geconfigureerde groep BOARD", async () => {
    const active = setup([token(), userinfo({ groups: { bestuur: { active: true } } }), page()]);
    await expect(completeOAuthLogin("code", config, active.dependencies)).resolves.toMatchObject({ role: "BOARD" });
    const unknown = setup([token(), userinfo({ groups: { ander: { active: true } } }), page()]);
    await expect(completeOAuthLogin("code", config, unknown.dependencies)).resolves.toMatchObject({ role: "MEMBER" });
  });
  it("gebruikt de user-ID allowlist als groups ontbreekt", async () => {
    const fallback = setup([token(), userinfo(), page()]);
    await expect(completeOAuthLogin("code", { ...config, boardGroupSlug: "onjuiste-slug", boardUserIds: "oauth-1" }, fallback.dependencies)).resolves.toMatchObject({ role: "BOARD" });
  });
  it("logt uitsluitend veilige metadata", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logOAuthCallbackFailure(new OAuthCallbackError("OAUTH_USERINFO_SCHEMA_INVALID", "userinfo_schema", 200, [{ path: "picture", code: "invalid_format" }]), "request-1");
    const output = spy.mock.calls.flat().join(" ");
    expect(output).toContain("OAUTH_USERINFO_SCHEMA_INVALID");
    expect(output).toContain('"httpStatus":200');
    expect(output).toContain('"path":"picture"');
    expect(output).toContain('"code":"invalid_format"');
    expect(output).not.toContain("super-secret");
    expect(output).not.toContain("access-secret");
    expect(output).not.toContain("geen-geldige-url");
    expect(output).not.toContain("Testlid");
  });
});
