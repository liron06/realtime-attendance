import { describe, expect, it } from "vitest";
import { activeParticipations, matchParticipationCheckIns } from "@/lib/participations";

const registration = (id: number, memberId: number | null, status: string) => ({
  congressusParticipationId: id,
  congressusMemberId: memberId,
  status,
});
const checkIn = (id: string, participationId: number | null, memberId: number | null) => ({
  id,
  participationId,
  member: { congressusMemberId: memberId },
});

describe("geldige aanmeldingen", () => {
  it("accepteert alleen de bestaande actieve statussen", () => {
    const statuses = ["approved", "participating", "subscribed", "waiting list", "unsubscribed", "declined", "payment pending"];
    const active = activeParticipations("ticketing", statuses.map((status, index) => registration(index + 1, index + 1, status)));
    expect(active.map(item => item.status)).toEqual(["approved", "participating", "subscribed"]);
  });

  it("houdt approved en sluit een oudere unsubscribed deelname van hetzelfde lid uit", () => {
    const active = activeParticipations("single", [registration(10, 42, "unsubscribed"), registration(11, 42, "approved")]);
    expect(active.map(item => item.congressusParticipationId)).toEqual([11]);
  });

  it("telt twee geldige deelnamerecords van hetzelfde lid één keer bij single", () => {
    const active = activeParticipations("single", [registration(10, 42, "subscribed"), registration(11, 42, "approved")]);
    expect(active).toHaveLength(1);
  });

  it("behandelt een lid met alleen unsubscribed niet als actief aangemeld", () => {
    expect(activeParticipations("single", [registration(10, 42, "unsubscribed")])).toEqual([]);
  });

  it("berekent voor Schaatsen 16 actieve leden, 14 ingecheckt en 2 nog niet", () => {
    const registrations = [
      ...Array.from({ length: 16 }, (_, index) => registration(index + 1, index + 1, "approved")),
      registration(100, 1, "unsubscribed"),
      registration(101, 2, "unsubscribed"),
    ];
    const active = activeParticipations("single", registrations);
    const scans = Array.from({ length: 14 }, (_, index) => checkIn(`scan-${index + 1}`, index + 1, index + 1));
    const matched = matchParticipationCheckIns(active, scans);
    expect({ active: active.length, checkedIn: matched.size, pending: active.length - matched.size }).toEqual({ active: 16, checkedIn: 14, pending: 2 });
  });

  it("behoudt afzonderlijke geldige registraties bij ticketing", () => {
    const active = activeParticipations("ticketing", [registration(10, 42, "approved"), registration(11, 42, "approved")]);
    expect(active).toHaveLength(2);
  });

  it("laat een historische gesynchroniseerde check-in intact maar koppelt hem niet aan unsubscribed", () => {
    const historical = checkIn("scan-old", 10, 42);
    const active = activeParticipations("single", [registration(10, 42, "unsubscribed")]);
    expect(matchParticipationCheckIns(active, [historical]).size).toBe(0);
    expect(historical).toEqual({ id: "scan-old", participationId: 10, member: { congressusMemberId: 42 } });
  });
});
