export const RELEVANCE_LEAD_MS = 30 * 60 * 1_000;

export type PrioritizableEvent = {
  startsAt: Date | string;
  endsAt: Date | string;
  closedAt: Date | string | null;
};

export type EventTiming = "soon" | "active" | "future" | "past" | "closed";

export function eventTiming(event: PrioritizableEvent, now: Date): EventTiming {
  if (event.closedAt) return "closed";
  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt).getTime();
  const current = now.getTime();
  if (current >= startsAt - RELEVANCE_LEAD_MS && current <= endsAt) return current < startsAt ? "soon" : "active";
  return current < startsAt ? "future" : "past";
}

export function prioritizeEvents<T extends PrioritizableEvent>(events: T[], now: Date): T[] {
  const rank: Record<EventTiming, number> = { soon: 0, active: 0, future: 1, past: 2, closed: 3 };
  return [...events].sort((left, right) => {
    const leftTiming = eventTiming(left, now);
    const rightTiming = eventTiming(right, now);
    const rankDifference = rank[leftTiming] - rank[rightTiming];
    if (rankDifference) return rankDifference;
    const leftStart = new Date(left.startsAt).getTime();
    const rightStart = new Date(right.startsAt).getTime();
    return leftTiming === "past" || leftTiming === "closed" ? rightStart - leftStart : leftStart - rightStart;
  });
}

export function nextTimingChange(events: PrioritizableEvent[], now: Date): number | null {
  const current = now.getTime();
  const boundaries = events.flatMap(event => event.closedAt ? [] : [
    new Date(event.startsAt).getTime() - RELEVANCE_LEAD_MS,
    new Date(event.startsAt).getTime(),
    new Date(event.endsAt).getTime() + 1,
  ]).filter(boundary => boundary > current);
  return boundaries.length ? Math.min(...boundaries) : null;
}
