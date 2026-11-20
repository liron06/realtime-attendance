import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  eventFindUnique: vi.fn(),
  participationFindMany: vi.fn(),
  checkInFindUnique: vi.fn(),
  transaction: vi.fn(),
  verifyQrToken: vi.fn(),
  checkInCreate: vi.fn(),
  outboxCreate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/qr", () => ({ verifyQrToken: mocks.verifyQrToken }));
vi.mock("@/lib/db", () => ({ db: {
  user: { findUnique: mocks.userFindUnique },
  eventCache: { findUnique: mocks.eventFindUnique },
  eventParticipation: { findMany: mocks.participationFindMany },
  checkIn: { findUnique: mocks.checkInFindUnique },
  $transaction: mocks.transaction,
} }));

import { checkIn } from "@/lib/check-in";

const approved = { congressusParticipationId: 12, status: "approved", tickets: [] };
const unsubscribed = { congressusParticipationId: 11, status: "unsubscribed", tickets: [] };

describe("uitzonderingscheck-ins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique
      .mockResolvedValueOnce({ id: "board-1", role: "BOARD", active: true })
      .mockResolvedValueOnce({ id: "member-1", active: true, congressusMemberId: 42, name: "Testlid" });
    mocks.eventFindUnique.mockResolvedValue({ id: "event-1", congressusEventId: 7, participationMode: "single", closedAt: null });
    mocks.verifyQrToken.mockResolvedValue({ memberId: "member-1" });
    mocks.checkInFindUnique.mockResolvedValue(null);
    mocks.participationFindMany.mockResolvedValue([]);
    mocks.checkInCreate.mockImplementation(async ({ data }) => ({ id: "check-1", checkedInAt: new Date(), ...data }));
    mocks.transaction.mockImplementation(async callback => callback({
      checkIn: { create: mocks.checkInCreate },
      syncOutbox: { create: mocks.outboxCreate },
      auditLog: { create: mocks.auditCreate },
    }));
  });

  it("kiest approved en nooit de oudere unsubscribed deelname", async () => {
    mocks.participationFindMany.mockResolvedValue([approved, unsubscribed]);
    await checkIn({ eventCongressusId: 7, scannerId: "board-1", method: "MANUAL", memberId: "member-1" });
    expect(mocks.checkInCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ participationId: 12, exception: false, syncStatus: "PENDING" }) });
    expect(mocks.outboxCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ participationId: 12 }) });
  });

  it("synchroniseert niet willekeurig bij meerdere geldige ticketregistraties", async () => {
    mocks.eventFindUnique.mockResolvedValue({ id: "event-1", congressusEventId: 7, participationMode: "ticketing", closedAt: null });
    mocks.participationFindMany.mockResolvedValue([
      { congressusParticipationId: 13, status: "approved", tickets: [{ id: 101, name: "Testlid" }] },
      { congressusParticipationId: 12, status: "approved", tickets: [{ id: 100, name: "Testlid" }] },
    ]);
    await expect(checkIn({ eventCongressusId: 7, scannerId: "board-1", method: "MANUAL", memberId: "member-1" })).rejects.toMatchObject({ code: "AMBIGUOUS_TICKET" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.outboxCreate).not.toHaveBeenCalled();
  });

  it("behandelt alleen unsubscribed als niet aangemeld", async () => {
    mocks.participationFindMany.mockResolvedValue([unsubscribed]);
    await expect(checkIn({ eventCongressusId: 7, scannerId: "board-1", method: "MANUAL", memberId: "member-1" })).rejects.toMatchObject({ code: "NOT_REGISTERED" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("registreert na bevestiging een uitzondering zonder Congressus-outbox", async () => {
    mocks.participationFindMany.mockResolvedValue([unsubscribed]);
    const result = await checkIn({ eventCongressusId: 7, scannerId: "board-1", method: "CAMERA", qrToken: "signed-token", allowException: true, reason: "Afgestemd met organisatie" });
    expect(result.checkIn).toMatchObject({ exception: true, syncStatus: "NOT_APPLICABLE", participationId: undefined });
    expect(mocks.outboxCreate).not.toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ reason: "Afgestemd met organisatie" }) });
  });

  it("weigert een uitzondering zonder geldige reden", async () => {
    await expect(checkIn({ eventCongressusId: 7, scannerId: "board-1", method: "MANUAL", memberId: "member-1", allowException: true, reason: "  " })).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("weigert een dubbele uitzonderingscheck-in vóór een nieuwe mutatie", async () => {
    mocks.checkInFindUnique.mockResolvedValue({ checkedInAt: new Date("2026-11-20T19:14:00Z") });
    await expect(checkIn({ eventCongressusId: 7, scannerId: "board-1", method: "MANUAL", memberId: "member-1", allowException: true, reason: "Bestuursbesluit" })).rejects.toMatchObject({ code: "ALREADY_CHECKED_IN" });
    expect(mocks.participationFindMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("laat een ongeldige QR-code niet via allowException passeren", async () => {
    mocks.verifyQrToken.mockRejectedValue(new Error("expired"));
    await expect(checkIn({ eventCongressusId: 7, scannerId: "board-1", method: "CAMERA", qrToken: "expired-token", allowException: true, reason: "Bestuursbesluit" })).rejects.toMatchObject({ code: "INVALID_QR" });
    expect(mocks.eventFindUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
