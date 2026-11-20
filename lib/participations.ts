export const VALID_PARTICIPATION_STATUSES = new Set(["approved", "participating", "subscribed"]);

export function isValidParticipationStatus(status: string) {
  return VALID_PARTICIPATION_STATUSES.has(status.trim().toLowerCase());
}

type ParticipationIdentity = {
  congressusParticipationId: number;
  congressusMemberId: number | null;
  status: string;
};

type CheckInIdentity = {
  id: string;
  participationId: number | null;
  member: { congressusMemberId: number | null };
};

export function activeParticipations<T extends ParticipationIdentity>(mode: string, participations: T[]) {
  const valid = participations.filter(participation => isValidParticipationStatus(participation.status));
  if (mode === "ticketing") return valid;
  const seenMembers = new Set<number>();
  return valid.filter(participation => {
    if (!Number.isInteger(participation.congressusMemberId)) return true;
    const memberId = participation.congressusMemberId as number;
    if (seenMembers.has(memberId)) return false;
    seenMembers.add(memberId);
    return true;
  });
}

export function matchParticipationCheckIns<P extends ParticipationIdentity, C extends CheckInIdentity>(participations: P[], checkIns: C[]) {
  const byParticipation = new Map(checkIns.filter(checkIn => Number.isInteger(checkIn.participationId)).map(checkIn => [checkIn.participationId as number, checkIn]));
  const memberParticipationCounts = new Map<number, number>();
  const byMember = new Map(checkIns.filter(checkIn => Number.isInteger(checkIn.member.congressusMemberId)).map(checkIn => [checkIn.member.congressusMemberId as number, checkIn]));
  for (const participation of participations) if (Number.isInteger(participation.congressusMemberId)) memberParticipationCounts.set(participation.congressusMemberId as number, (memberParticipationCounts.get(participation.congressusMemberId as number) ?? 0) + 1);

  return new Map(participations.flatMap(participation => {
    const direct = byParticipation.get(participation.congressusParticipationId);
    if (direct) return [[participation.congressusParticipationId, direct] as const];
    if (!Number.isInteger(participation.congressusMemberId)) return [];
    const memberId = participation.congressusMemberId as number;
    const byUniqueMember = memberParticipationCounts.get(memberId) === 1 ? byMember.get(memberId) : undefined;
    return byUniqueMember ? [[participation.congressusParticipationId, byUniqueMember] as const] : [];
  }));
}
