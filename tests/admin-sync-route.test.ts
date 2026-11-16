import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireSession: vi.fn(), assertCsrf: vi.fn(), syncEvents: vi.fn(), logSyncDiagnostic: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/csrf", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/csrf")>();
  return { ...original, assertCsrf: mocks.assertCsrf };
});
vi.mock("@/lib/event-sync", () => ({ syncEvents: mocks.syncEvents, logSyncDiagnostic: mocks.logSyncDiagnostic }));

import { CongressusError } from "@/lib/congressus/client";
import { CsrfError } from "@/lib/csrf";
import { POST } from "@/app/api/admin/sync/route";

const request = () => new Request("https://attendance.example.test/api/admin/sync", { method: "POST", headers: { "x-csrf-token": "a".repeat(43) } });

describe("POST /api/admin/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ role: "BOARD" });
    mocks.assertCsrf.mockResolvedValue(undefined);
    mocks.syncEvents.mockResolvedValue({ ok: true, events: 2, eventsFailed: 0, participations: 4, failures: [] });
  });

  it("behoudt BOARD-autorisatie en controleert CSRF vóór synchronisatie", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.requireSession).toHaveBeenCalledWith("BOARD");
    expect(mocks.assertCsrf).toHaveBeenCalledOnce();
    expect(mocks.syncEvents).toHaveBeenCalledOnce();
  });

  it("weigert een ontbrekende sessie zonder CSRF of sync uit te voeren", async () => {
    mocks.requireSession.mockRejectedValue(new Error("UNAUTHORIZED"));
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body).toMatchObject({ ok: false, code: "SYNC_AUTH_REQUIRED" });
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.assertCsrf).not.toHaveBeenCalled();
    expect(mocks.syncEvents).not.toHaveBeenCalled();
  });

  it("geeft een veilige CSRF-fout met request-ID", async () => {
    mocks.assertCsrf.mockRejectedValue(new CsrfError());
    const response = await POST(request());
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "SYNC_CSRF_INVALID" });
    expect(response.status).toBe(403);
    expect(mocks.syncEvents).not.toHaveBeenCalled();
  });

  it("onderscheidt Congressus-rechtenfouten zonder upstreambody", async () => {
    mocks.syncEvents.mockRejectedValue(new CongressusError(403, "verborgen upstreamtekst", undefined, "CONGRESSUS_FORBIDDEN"));
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false, code: "CONGRESSUS_FORBIDDEN" });
    expect(JSON.stringify(body)).not.toContain("verborgen upstreamtekst");
  });

  it("rapporteert gedeeltelijke synchronisatie zonder successen terug te draaien", async () => {
    mocks.syncEvents.mockResolvedValue({ ok: false, events: 1, eventsFailed: 1, participations: 3, failures: [{ errorCode: "SYNC_DATABASE_ERROR", httpStatus: 500 }] });
    const response = await POST(request());
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: "SYNC_PARTIAL", events: 1, eventsFailed: 1 });
    expect(response.status).toBe(207);
  });
});
