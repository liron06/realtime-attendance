import { CalendarDays, ChevronRight, Clock3, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { nlDate } from "@/lib/utils";
import { SyncButton } from "@/components/sync-button";

export default async function Board() {
  const events = await db.eventCache.findMany({ orderBy: { startsAt: "desc" }, include: { _count: { select: { checkIns: true, participations: true } } } });
  const now = new Date();

  return <main className="page-shell py-7 sm:py-10">
    <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="eyebrow">Bestuursportaal</p><h1 className="mt-1 text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">Activiteiten</h1><p className="mt-2 text-slate-500">Selecteer een activiteit om de registratie te beheren.</p></div>
      <SyncButton/>
    </div>
    <div className="mt-7 grid gap-4 lg:gap-5">
      {events.map(event => {
        const state = event.closedAt ? "Afgesloten" : event.startsAt <= now && event.endsAt >= now ? "Actief" : event.startsAt > now ? "Toekomstig" : "Afgelopen";
        const stateClass = state === "Actief" ? "badge-success" : state === "Toekomstig" ? "badge-brand" : "";
        const percentage = event._count.participations ? Math.round(event._count.checkIns / event._count.participations * 100) : 0;
        return <a href={`/bestuur/activiteiten/${event.congressusEventId}`} key={event.id} className="card card-interactive group grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className={`badge ${stateClass}`}>{state}</span>{event.participationMode === "unknown" && <span className="badge badge-warning">Deelnamevorm onbekend</span>}</div>
            <h2 className="mt-3 truncate text-xl font-black text-slate-900 sm:text-2xl">{event.name}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500"><span className="flex items-center gap-1.5"><CalendarDays size={16}/>{nlDate(event.startsAt)}</span>{event.location && <span className="flex items-center gap-1.5"><MapPin size={16}/>{event.location}</span>}</div>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center text-xs text-slate-500 sm:gap-6 sm:px-5 sm:text-sm">
            <div><b className="block text-xl text-slate-900">{event._count.participations}</b>Aangemeld</div>
            <div><b className="block text-xl text-emerald-700">{event._count.checkIns}</b>Ingecheckt</div>
            <div><b className="block text-xl text-slate-900">{percentage}%</b>Aanwezig</div>
          </div>
          <span className="grid size-11 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)] transition group-hover:bg-[var(--brand)] group-hover:text-white"><ChevronRight size={22}/><span className="sr-only">Openen</span></span>
        </a>;
      })}
      {events.length === 0 && <div className="card p-10 text-center text-slate-500"><Clock3 className="mx-auto mb-3 text-[var(--brand)]"/><p className="font-semibold">Nog geen activiteiten gesynchroniseerd.</p></div>}
    </div>
  </main>;
}
