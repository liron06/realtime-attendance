import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), requireSession: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: mocks.get, set: mocks.set })) }));
vi.mock("@/lib/session", () => ({ requireSession: mocks.requireSession }));

import { GET } from "@/app/api/csrf/route";

describe("GET /api/csrf", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.set.mockReset();
    mocks.requireSession.mockReset().mockResolvedValue({ userId: "user-1", role: "BOARD" });
  });

  it("geeft bij het eerste verzoek zonder cookie een token uit vanuit de Route Handler", async () => {
    mocks.get.mockReturnValue(undefined);
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mocks.set).toHaveBeenCalledWith("rt_csrf", body.token, expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/" }));
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("hergebruikt een geldige cookie zonder opnieuw te schrijven", async () => {
    const token = "a".repeat(43);
    mocks.get.mockReturnValue({ value: token });
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ token });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("vervangt een ongeldige bestaande cookie", async () => {
    mocks.get.mockReturnValue({ value: "te-kort" });
    const response = await GET();
    const body = await response.json();
    expect(body.token).not.toBe("te-kort");
    expect(mocks.set).toHaveBeenCalledOnce();
  });

  it("geeft zonder geldige sessie geen token of cookie", async () => {
    mocks.requireSession.mockRejectedValue(new Error("UNAUTHORIZED"));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
