import { afterEach, describe, expect, it, vi } from "vitest";
import { allPages, CongressusError, eventPeriod, listEvents } from "@/lib/congressus/client";
import { z } from "zod";

const page = (data: unknown[], options: { hasNext?: boolean; next?: number | null; total?: number } = {}) => Response.json({
  has_prev: false,
  prev_num: null,
  has_next: options.hasNext ?? false,
  next_num: options.next ?? null,
  data,
  total: options.total ?? data.length
});

describe("Congressus API-client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gebruikt order, relevante periode en maximale paginagrootte", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(page([{ id: 1, name: "Event", start: "2026-11-16T10:00:00", end: "2026-11-16T12:00:00", participation_mode: "single" }]));
    await listEvents(new Date("2026-11-16T12:00:00Z"));
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("order")).toBe("start:desc");
    expect(url.searchParams.get("period_filter")).toBe("20260818..20271116");
    expect(url.searchParams.get("page_size")).toBe("100");
  });

  it("volgt next_num in plaats van zelf paginanummers te raden", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(page([1], { hasNext: true, next: 4, total: 2 }))
      .mockResolvedValueOnce(page([2], { total: 2 }));
    await expect(allPages("/items", z.number())).resolves.toEqual([1, 2]);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("page")).toBe("4");
  });

  it("classificeert rechten- en schemafouten zonder response-inhoud", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ detail: "persoonlijke informatie" }, { status: 403 }));
    await expect(allPages("/items", z.number())).rejects.toMatchObject({ code: "CONGRESSUS_FORBIDDEN", status: 403 });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(page(["geen nummer"]));
    const error = await allPages("/items", z.number()).catch(caught => caught);
    expect(error).toBeInstanceOf(CongressusError);
    expect(error).toMatchObject({ code: "CONGRESSUS_SCHEMA_ERROR", schemaIssues: [{ path: "data.0", code: "invalid_type" }] });
    expect(JSON.stringify(error)).not.toContain("geen nummer");
  });

  it("onderscheidt rate limiting en bewaart Retry-After veilig", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "30" } }));
    await expect(allPages("/items", z.number())).rejects.toMatchObject({ code: "CONGRESSUS_RATE_LIMITED", status: 429, retryAfter: 30 });
  });

  it("berekent standaard een begrensde periode", () => {
    expect(eventPeriod(new Date("2026-11-16T12:00:00Z"))).toBe("20260818..20271116");
  });
});
