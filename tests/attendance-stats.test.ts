import { describe, expect, it } from "vitest";
import { attendanceOverview, isValidParticipationStatus } from "@/lib/attendance-stats";

type Participation = Parameters<typeof attendanceOverview>[1][number];
type CheckIn = Parameters<typeof attendanceOverview>[2][number];

const participation = (id: number, memberId: number | null, status = "approved", tickets: unknown = []): Participation => ({
  congressusParticipationId: id,
  congressusMemberId: memberId,
  memberName: memberId === null ? "Onbekend" : `Lid ${memberId}`,
  memberNumber: memberId === null ? null : `RT-${memberId}`,
  status,
  tickets,
});

const checkIn = (id: number, memberId: number | null, options: { exception?: boolean; ticketId?: number | null } = {}): CheckIn => ({
  id: `check-${id}`,
  exception: options.exception ?? false,
  ticketId: options.ticketId ?? null,
  member: { congressusMemberId: memberId },
});

describe("aanwezigheidstellers", () => {
  it("telt 16 unieke leden, 14 ingecheckt en 2 nog niet ingecheckt", () => {
    const participations = Array.from({ length: 16 }, (_, index) => participation(index + 1, index + 1));
    const checkIns = Array.from({ length: 14 }, (_, index) => checkIn(index + 1, index + 1));
    expect(attendanceOverview("single", participations, checkIns)).toMatchObject({ registered: 16, checkedIn: 14, registeredCheckedIn: 14, notCheckedIn: 2 });
  });

  it("reduceert 18 deelnamerecords voor 16 leden tot 16 unieke registraties", () => {
    const participations = [...Array.from({ length: 16 }, (_, index) => participation(index + 1, index + 1)), participation(17, 3), participation(18, 8)];
    const checkIns = Array.from({ length: 14 }, (_, index) => checkIn(index + 1, index + 1));
    expect(attendanceOverview("single", participations, checkIns)).toMatchObject({ registered: 16, checkedIn: 14, notCheckedIn: 2, duplicateRegistrations: 2 });
  });

  it("telt een dubbele deelname van hetzelfde lid maar één keer", () => {
    const overview = attendanceOverview("single", [participation(1, 42), participation(2, 42)], [checkIn(1, 42)]);
    expect(overview).toMatchObject({ registered: 1, checkedIn: 1, notCheckedIn: 0, duplicateRegistrations: 1 });
    expect(overview.rows).toHaveLength(1);
  });

  it("sluit geannuleerde, geweigerde, wachtende en betalingsopenstaande deelnames uit", () => {
    const statuses = ["unsubscribed", "declined", "waiting list", "payment pending"];
    const overview = attendanceOverview("single", statuses.map((status, index) => participation(index + 1, index + 1, status)), []);
    expect(overview).toMatchObject({ registered: 0, ignoredParticipations: 4, notCheckedIn: 0 });
    expect(isValidParticipationStatus("approved")).toBe(true);
  });

  it("telt een uitzonderingscheck-in als werkelijk ingecheckt maar niet als inschrijving", () => {
    const overview = attendanceOverview("single", [participation(1, 1), participation(2, 2)], [checkIn(1, 1), checkIn(2, 99, { exception: true })]);
    expect(overview).toMatchObject({ registered: 2, checkedIn: 2, registeredCheckedIn: 1, notCheckedIn: 1, exceptionCheckIns: 1 });
  });

  it("houdt bij ticketing hoofdboeker en gastticket als afzonderlijke tickets", () => {
    const tickets = [{ id: 501, name: "Hoofdboeker" }, { id: 502, name: "Gast" }];
    const overview = attendanceOverview("ticketing", [participation(1, 10, "approved", tickets)], [checkIn(1, 10, { ticketId: 501 })]);
    expect(overview).toMatchObject({ unit: "tickets", registered: 2, checkedIn: 1, notCheckedIn: 1 });
    expect(overview.rows.map(row => [row.ticketId, row.name])).toEqual([[502, "Gast"], [501, "Hoofdboeker"]]);
  });

  it("raadt identiteit niet bij ontbrekende Congressus member-ID's", () => {
    const overview = attendanceOverview("single", [participation(1, null), participation(2, null)], [checkIn(1, null)]);
    expect(overview).toMatchObject({ registered: 0, checkedIn: 1, registeredCheckedIn: 0, notCheckedIn: 0, unidentifiedRegistrations: 2, unmatchedCheckIns: 1 });
    expect(overview.rows).toHaveLength(0);
  });
});
