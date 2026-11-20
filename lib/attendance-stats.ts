export const VALID_PARTICIPATION_STATUSES = new Set(["approved", "participating", "subscribed"]);

export function isValidParticipationStatus(status: string) {
  return VALID_PARTICIPATION_STATUSES.has(status.trim().toLowerCase());
}

type ParticipationInput = {
  congressusParticipationId: number;
  congressusMemberId: number | null;
  memberName: string;
  memberNumber: string | null;
  status: string;
  tickets: unknown;
};

type CheckInInput = {
  id: string;
  exception: boolean;
  ticketId: number | null;
  member: {
    congressusMemberId: number | null;
  };
};

type Ticket = { id: number; name: string | null };

export type AttendanceRow = {
  key: string;
  name: string;
  memberNumber: string | null;
  status: string;
  ticketId: number | null;
  checkInId: string | null;
};

export type AttendanceOverview = {
  unit: "members" | "tickets";
  registered: number;
  checkedIn: number;
  registeredCheckedIn: number;
  notCheckedIn: number;
  exceptionCheckIns: number;
  unmatchedCheckIns: number;
  ignoredParticipations: number;
  unidentifiedRegistrations: number;
  duplicateRegistrations: number;
  rows: AttendanceRow[];
};

function ticketsFrom(value: unknown) {
  if (!Array.isArray(value)) return { tickets: [] as Ticket[], unidentified: 0 };
  const tickets: Ticket[] = [];
  let unidentified = 0;
  for (const valueItem of value) {
    if (!valueItem || typeof valueItem !== "object") { unidentified++; continue; }
    const item = valueItem as Record<string, unknown>;
    if (!Number.isInteger(item.id)) { unidentified++; continue; }
    tickets.push({ id: item.id as number, name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : null });
  }
  return { tickets, unidentified };
}

export function attendanceOverview(mode: string, participations: ParticipationInput[], checkIns: CheckInInput[]): AttendanceOverview {
  const valid = participations.filter(participation => isValidParticipationStatus(participation.status));
  const ignoredParticipations = participations.length - valid.length;
  const exceptionCheckIns = checkIns.filter(checkIn => checkIn.exception).length;
  const usedCheckIns = new Set<string>();
  let unidentifiedRegistrations = 0;
  let duplicateRegistrations = 0;
  const rows: AttendanceRow[] = [];

  if (mode === "ticketing") {
    const uniqueTickets = new Map<number, { participation: ParticipationInput; ticket: Ticket }>();
    for (const participation of valid) {
      const parsed = ticketsFrom(participation.tickets);
      unidentifiedRegistrations += parsed.unidentified || (parsed.tickets.length === 0 ? 1 : 0);
      for (const ticket of parsed.tickets) {
        if (uniqueTickets.has(ticket.id)) { duplicateRegistrations++; continue; }
        uniqueTickets.set(ticket.id, { participation, ticket });
      }
    }
    const checkInByTicket = new Map(checkIns.filter(checkIn => Number.isInteger(checkIn.ticketId)).map(checkIn => [checkIn.ticketId as number, checkIn]));
    for (const { participation, ticket } of uniqueTickets.values()) {
      const checkIn = checkInByTicket.get(ticket.id) ?? null;
      if (checkIn) usedCheckIns.add(checkIn.id);
      rows.push({
        key: `ticket:${ticket.id}`,
        name: ticket.name ?? participation.memberName,
        memberNumber: participation.memberNumber,
        status: participation.status,
        ticketId: ticket.id,
        checkInId: checkIn?.id ?? null,
      });
    }
  } else {
    const uniqueMembers = new Map<number, ParticipationInput>();
    for (const participation of valid) {
      if (!Number.isInteger(participation.congressusMemberId)) { unidentifiedRegistrations++; continue; }
      const memberId = participation.congressusMemberId as number;
      if (uniqueMembers.has(memberId)) { duplicateRegistrations++; continue; }
      uniqueMembers.set(memberId, participation);
    }
    const checkInByMember = new Map(checkIns.filter(checkIn => Number.isInteger(checkIn.member.congressusMemberId)).map(checkIn => [checkIn.member.congressusMemberId as number, checkIn]));
    for (const [memberId, participation] of uniqueMembers) {
      const checkIn = checkInByMember.get(memberId) ?? null;
      if (checkIn) usedCheckIns.add(checkIn.id);
      rows.push({
        key: `member:${memberId}`,
        name: participation.memberName,
        memberNumber: participation.memberNumber,
        status: participation.status,
        ticketId: null,
        checkInId: checkIn?.id ?? null,
      });
    }
  }

  rows.sort((left, right) => left.name.localeCompare(right.name, "nl"));
  const registeredCheckedIn = rows.filter(row => row.checkInId !== null).length;
  const unmatchedCheckIns = checkIns.filter(checkIn => !checkIn.exception && !usedCheckIns.has(checkIn.id)).length;
  return {
    unit: mode === "ticketing" ? "tickets" : "members",
    registered: rows.length,
    checkedIn: mode === "ticketing" ? registeredCheckedIn : checkIns.length,
    registeredCheckedIn,
    notCheckedIn: rows.length - registeredCheckedIn,
    exceptionCheckIns,
    unmatchedCheckIns,
    ignoredParticipations,
    unidentifiedRegistrations,
    duplicateRegistrations,
    rows,
  };
}
