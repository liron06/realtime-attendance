import { afterEach, describe, expect, it, vi } from "vitest";
import { internalParticipationMode, syncEvents } from "@/lib/event-sync";
import type { CongressusEvent, Participation } from "@/lib/congressus/types";

const event = (id: number, participationMode: CongressusEvent["participation_mode"] = "single"): CongressusEvent => ({ id, name: `Event ${id}`, start: "2026-11-16T10:00:00", end: "2026-11-16T12:00:00", participation_mode: participationMode });

describe("event-synchronisatie", () => {
  afterEach(() => vi.restoreAllMocks());

  it("behoudt geslaagde activiteiten wanneer één activiteit faalt", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const persisted: number[] = [];
    const result = await syncEvents("request-1", {
      listEvents: vi.fn(async () => [event(1), event(2), event(3)]),
      listParticipations: vi.fn(async () => []),
      persistEvent: vi.fn(async current => {
        if (current.id === 2) throw new Error("database details mogen niet lekken");
        persisted.push(current.id);
        return 0;
      })
    });
    expect(persisted).toEqual([1, 3]);
    expect(result).toMatchObject({ ok: false, events: 2, eventsFailed: 1, participations: 0 });
    expect(result.failures).toEqual([{ errorCode: "SYNC_DATABASE_ERROR", httpStatus: 500 }]);
  });

  it("logt alleen veilige metadata en geen foutmelding uit de database", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await syncEvents("safe-request", {
      listEvents: vi.fn(async () => [event(1)]),
      listParticipations: vi.fn(async () => []),
      persistEvent: vi.fn(async () => { throw new Error("gevoelige databasewaarde"); })
    });
    const output = errorSpy.mock.calls.flat().join(" ");
    expect(output).toContain("safe-request");
    expect(output).toContain("SYNC_DATABASE_ERROR");
    expect(output).not.toContain("gevoelige databasewaarde");
  });

  it("haalt alleen deelnames op voor vastgestelde deelnamevormen", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const listParticipations = vi.fn<(eventId: number) => Promise<Participation[]>>(async () => []);
    const persistEvent = vi.fn<(current: CongressusEvent, participations: Participation[]) => Promise<number>>(async () => 0);
    const events = [event(1, "single"), event(2, "ticketing"), event(3, "none"), event(4, null)];

    await expect(syncEvents("participation-modes", { listEvents: vi.fn(async () => events), listParticipations, persistEvent })).resolves.toMatchObject({ ok: true, events: 4 });

    expect(listParticipations.mock.calls.map(([eventId]) => eventId)).toEqual([1, 2]);
    expect(persistEvent.mock.calls.map(([current, participations]) => [current.participation_mode, participations])).toEqual([
      ["single", []], ["ticketing", []], ["none", []], [null, []]
    ]);
    expect(internalParticipationMode(null)).toBe("unknown");
    expect(internalParticipationMode("single")).toBe("single");
    expect(internalParticipationMode("ticketing")).toBe("ticketing");
    expect(internalParticipationMode("none")).toBe("none");
  });
});
