import { db } from "@/lib/db";
import { SyncButton } from "@/components/sync-button";
import { EventList } from "@/components/event-list";
import { attendanceOverview } from "@/lib/attendance-stats";

export default async function Board() {
  const events = await db.eventCache.findMany({ include: {
    participations: { select: { congressusParticipationId: true, congressusMemberId: true, memberName: true, memberNumber: true, status: true, tickets: true } },
    checkIns: { select: { id: true, exception: true, participationId: true, ticketId: true, member: { select: { congressusMemberId: true } } } },
  } });
  const eventItems = events.map(event => {
    const overview = attendanceOverview(event.participationMode, event.participations, event.checkIns);
    return {
      id: event.id,
      congressusEventId: event.congressusEventId,
      name: event.name,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      closedAt: event.closedAt?.toISOString() ?? null,
      location: event.location,
      participationMode: event.participationMode,
      unit: overview.unit,
      registered: overview.registered,
      checkedIn: overview.checkedIn,
      notCheckedIn: overview.notCheckedIn,
      exceptionCheckIns: overview.exceptionCheckIns,
      participationRecords: overview.participationRecords,
      identifiableTickets: overview.identifiableTickets,
    };
  });

  return <main className="page-shell py-7 sm:py-10">
    <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="eyebrow">Bestuursportaal</p><h1 className="mt-1 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">Activiteiten</h1><p className="mt-2 text-slate-500">Selecteer een activiteit om de registratie te beheren.</p></div>
      <SyncButton/>
    </div>
    <EventList events={eventItems} initialNow={new Date().toISOString()}/>
  </main>;
}
