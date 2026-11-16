import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  eventFindUnique: vi.fn(),
  participationFindFirst: vi.fn(),
  transaction: vi.fn(),
  verifyQrToken: vi.fn()
}));
vi.mock("@/lib/qr", () => ({ verifyQrToken: mocks.verifyQrToken }));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.userFindUnique },
    eventCache: { findUnique: mocks.eventFindUnique },
    eventParticipation: { findFirst: mocks.participationFindFirst },
    $transaction: mocks.transaction
  }
}));

import { checkIn } from "@/lib/check-in";

describe("check-in bij onbekende deelnamevorm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique
      .mockResolvedValueOnce({ id: "board-1", role: "BOARD", active: true })
      .mockResolvedValueOnce({ id: "member-1", active: true, congressusMemberId: 42, name: "Testlid" });
    mocks.eventFindUnique.mockResolvedValue({ id: "event-1", congressusEventId: 7, participationMode: "unknown", closedAt: null });
    mocks.verifyQrToken.mockResolvedValue({ memberId: "member-1" });
  });

  it("blokkeert een QR-check-in vóór deelname-opzoeking en databasemutaties", async () => {
    await expect(checkIn({ eventCongressusId: 7, scannerId: "board-1", qrToken: "signed-qr-token", method: "CAMERA" })).rejects.toMatchObject({
      code: "UNKNOWN_PARTICIPATION_MODE",
      status: 409,
      message: expect.stringContaining("deelnamevorm")
    });
    expect(mocks.participationFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
