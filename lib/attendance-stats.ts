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
  participationId: number | null;
  ticketId: number | null;
  member: { congressusMemberId: number | null };
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
  unit: "members" | "tickets" | "registrations";
  registered: number;
  checkedIn: number;
  registeredCheckedIn: number;
  notCheckedIn: number;
  participationRecords: number;
  uniqueMembers: number;
  identifiableTickets: number;
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

function uniqueCheckIn<T extends CheckInInput>(candidates: T[]) {
  return candidates.length === 1 ? candidates[0] : null;
}

export function attendanceOverview(mode: string, participations: ParticipationInput[], checkIns: CheckInInput[]): AttendanceOverview {
  const valid = participations.filter(participation => isValidParticipationStatus(participation.status));
  const ignoredParticipations = participations.length - valid.length;
  const exceptionCheckIns = checkIns.filter(checkIn => checkIn.exception).length;
  const parsedTickets = new Map(valid.map(participation => [participation.congressusParticipationId, ticketsFrom(participation.tickets)]));
  const uniqueMemberIds = new Set(valid.flatMap(participation => Number.isInteger(participation.congressusMemberId) ? [participation.congressusMemberId as number] : []));
  const uniqueTicketIds = new Set(valid.flatMap(participation => parsedTickets.get(participation.congressusParticipationId)?.tickets.map(ticket => ticket.id) ?? []));
  const completeTicketIdentity = valid.length === 0 || valid.every(participation => {
    const parsed = parsedTickets.get(participation.congressusParticipationId)!;
    return parsed.tickets.length > 0 && parsed.unidentified === 0;
  });
  const completeMemberIdentity = valid.length > 0 && valid.every(participation => Number.isInteger(participation.congressusMemberId));
  const unit: AttendanceOverview["unit"] = mode !== "ticketing" ? "members" : completeTicketIdentity ? "tickets" : completeMemberIdentity ? "members" : "registrations";
  const usedCheckIns = new Set<string>();
  const rows: AttendanceRow[] = [];
  let unidentifiedRegistrations = 0;
  let duplicateRegistrations = 0;

  const checkInsByParticipation = new Map<number, CheckInInput[]>();
  const checkInsByMember = new Map<number, CheckInInput[]>();
  for (const checkIn of checkIns) {
    if (Number.isInteger(checkIn.participationId)) checkInsByParticipation.set(checkIn.participationId as number, [...(checkInsByParticipation.get(checkIn.participationId as number) ?? []), checkIn]);
    if (Number.isInteger(checkIn.member.congressusMemberId)) checkInsByMember.set(checkIn.member.congressusMemberId as number, [...(checkInsByMember.get(checkIn.member.congressusMemberId as number) ?? []), checkIn]);
  }

  if (unit === "tickets") {
    const tickets = new Map<number, { participation: ParticipationInput; ticket: Ticket }>();
    const ticketCountByParticipation = new Map<number, number>();
    for (const participation of valid) {
      const parsed = parsedTickets.get(participation.congressusParticipationId)!;
      ticketCountByParticipation.set(participation.congressusParticipationId, parsed.tickets.length);
      for (const ticket of parsed.tickets) {
        if (tickets.has(ticket.id)) { duplicateRegistrations++; continue; }
        tickets.set(ticket.id, { participation, ticket });
      }
    }
    const checkInByTicket = new Map(checkIns.filter(checkIn => Number.isInteger(checkIn.ticketId)).map(checkIn => [checkIn.ticketId as number, checkIn]));
    for (const { participation, ticket } of tickets.values()) {
      const direct = checkInByTicket.get(ticket.id) ?? null;
      const byParticipation = ticketCountByParticipation.get(participation.congressusParticipationId) === 1 ? uniqueCheckIn(checkInsByParticipation.get(participation.congressusParticipationId) ?? []) : null;
      const checkIn = direct ?? byParticipation;
      if (checkIn) usedCheckIns.add(checkIn.id);
      rows.push({ key: `ticket:${ticket.id}`, name: ticket.name ?? participation.memberName, memberNumber: participation.memberNumber, status: participation.status, ticketId: ticket.id, checkInId: checkIn?.id ?? null });
    }
  } else if (unit === "members") {
    const members = new Map<number, ParticipationInput[]>();
    for (const participation of valid) {
      if (!Number.isInteger(participation.congressusMemberId)) { unidentifiedRegistrations++; continue; }
      const memberId = participation.congressusMemberId as number;
      const existing = members.get(memberId) ?? [];
      if (existing.length) duplicateRegistrations++;
      members.set(memberId, [...existing, participation]);
    }
    for (const [memberId, memberParticipations] of members) {
      const byMember = uniqueCheckIn(checkInsByMember.get(memberId) ?? []);
      const participationIds = new Set(memberParticipations.map(participation => participation.congressusParticipationId));
      const byParticipation = uniqueCheckIn(checkIns.filter(checkIn => checkIn.participationId !== null && participationIds.has(checkIn.participationId)));
      const checkIn = byMember ?? byParticipation;
      if (checkIn) usedCheckIns.add(checkIn.id);
      const participation = memberParticipations[0];
      rows.push({ key: `member:${memberId}`, name: participation.memberName, memberNumber: participation.memberNumber, status: participation.status, ticketId: null, checkInId: checkIn?.id ?? null });
    }
  } else {
    const participationCountByMember = new Map<number, number>();
    for (const participation of valid) if (Number.isInteger(participation.congressusMemberId)) participationCountByMember.set(participation.congressusMemberId as number, (participationCountByMember.get(participation.congressusMemberId as number) ?? 0) + 1);
    for (const participation of valid) {
      const direct = uniqueCheckIn(checkInsByParticipation.get(participation.congressusParticipationId) ?? []);
      const byMember = Number.isInteger(participation.congressusMemberId) && participationCountByMember.get(participation.congressusMemberId as number) === 1 ? uniqueCheckIn(checkInsByMember.get(participation.congressusMemberId as number) ?? []) : null;
      const checkIn = direct ?? byMember;
      if (checkIn) usedCheckIns.add(checkIn.id);
      rows.push({ key: `participation:${participation.congressusParticipationId}`, name: participation.memberName, memberNumber: participation.memberNumber, status: participation.status, ticketId: null, checkInId: checkIn?.id ?? null });
    }
  }

  rows.sort((left, right) => left.name.localeCompare(right.name, "nl"));
  const registeredCheckedIn = rows.filter(row => row.checkInId !== null).length;
  const unmatchedCheckIns = checkIns.filter(checkIn => !checkIn.exception && !usedCheckIns.has(checkIn.id)).length;
  return {
    unit,
    registered: rows.length,
    checkedIn: unit === "tickets" ? registeredCheckedIn : checkIns.length,
    registeredCheckedIn,
    notCheckedIn: rows.length - registeredCheckedIn,
    participationRecords: valid.length,
    uniqueMembers: uniqueMemberIds.size,
    identifiableTickets: uniqueTicketIds.size,
    exceptionCheckIns,
    unmatchedCheckIns,
    ignoredParticipations,
    unidentifiedRegistrations,
    duplicateRegistrations,
    rows,
  };
}
