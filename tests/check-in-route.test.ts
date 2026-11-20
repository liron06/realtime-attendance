import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  assertCsrf: vi.fn(),
  rateLimit: vi.fn(),
  checkIn: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/csrf", () => ({ assertCsrf: mocks.assertCsrf, CsrfError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/check-in", () => ({ checkIn: mocks.checkIn, CheckInError: class extends Error {} }));

import { POST } from "@/app/api/check-in/route";

describe("check-inroute voor uitzonderingen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ userId: "board-1" });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
    mocks.checkIn.mockResolvedValue({
      checkIn: { id: "check-1", exception: true, syncStatus: "NOT_APPLICABLE" },
      member: { id: "member-1", name: "Testlid" },
      synced: false,
    });
  });

  it("vereist BOARD en geeft de werkelijke uitzonderings- en synchronisatiestatus terug", async () => {
    const request = new NextRequest("http://localhost/api/check-in", {
      method: "POST",
      body: JSON.stringify({ eventId: 7, method: "CAMERA", qrToken: "verified-token", allowException: true, reason: "Bestuursbesluit" }),
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(mocks.requireSession).toHaveBeenCalledWith("BOARD");
    expect(mocks.checkIn).toHaveBeenCalledWith(expect.objectContaining({ allowException: true, reason: "Bestuursbesluit", qrToken: "verified-token" }));
    expect(await response.json()).toMatchObject({ ok: true, exception: true, syncStatus: "NOT_APPLICABLE" });
  });
});
