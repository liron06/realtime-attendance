import { describe, expect, it } from "vitest";
import { eventTiming, nextTimingChange, prioritizeEvents, RELEVANCE_LEAD_MS } from "@/lib/event-priority";

const startsAt = new Date("2026-07-10T18:00:00+02:00");
const endsAt = new Date("2026-07-10T20:00:00+02:00");
const event = { startsAt, endsAt, closedAt: null };

describe("activiteitprioritering", () => {
  it("is 31 minuten voor aanvang nog toekomstig", () => {
    expect(eventTiming(event, new Date(startsAt.getTime() - 31 * 60_000))).toBe("future");
  });
  it("is exact 30 minuten voor aanvang relevant", () => {
    expect(eventTiming(event, new Date(startsAt.getTime() - RELEVANCE_LEAD_MS))).toBe("soon");
  });
  it("is tijdens de activiteit nu bezig", () => {
    expect(eventTiming(event, new Date("2026-07-10T19:15:00+02:00"))).toBe("active");
  });
  it("is direct na afloop afgelopen", () => {
    expect(eventTiming(event, new Date(endsAt.getTime() + 1))).toBe("past");
  });
  it("sorteert relevant, toekomstig, afgelopen en afgesloten in die volgorde", () => {
    const now = new Date("2026-07-10T17:45:00+02:00");
    const items = [
      { id: "closed", startsAt: "2026-07-12T18:00:00+02:00", endsAt: "2026-07-12T20:00:00+02:00", closedAt: "2026-07-09T12:00:00+02:00" },
      { id: "past", startsAt: "2026-07-09T18:00:00+02:00", endsAt: "2026-07-09T20:00:00+02:00", closedAt: null },
      { id: "future", startsAt: "2026-07-11T18:00:00+02:00", endsAt: "2026-07-11T20:00:00+02:00", closedAt: null },
      { id: "relevant", startsAt, endsAt, closedAt: null },
    ];
    expect(prioritizeEvents(items, now).map(item => item.id)).toEqual(["relevant", "future", "past", "closed"]);
  });
  it("plant de eerstvolgende lokale statuswijziging zonder polling", () => {
    const now = new Date(startsAt.getTime() - 31 * 60_000);
    expect(nextTimingChange([event], now)).toBe(startsAt.getTime() - RELEVANCE_LEAD_MS);
  });
  it("blijft correct rond wintertijd omdat echte tijdstippen worden vergeleken", () => {
    const winterStart = new Date("2026-12-10T18:00:00+01:00");
    const winterEvent = { startsAt: winterStart, endsAt: new Date("2026-12-10T20:00:00+01:00"), closedAt: null };
    expect(eventTiming(winterEvent, new Date(winterStart.getTime() - RELEVANCE_LEAD_MS))).toBe("soon");
  });
});
