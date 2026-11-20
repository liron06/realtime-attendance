"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, Clock3, MapPin, ScanLine } from "lucide-react";
import { eventTiming, nextTimingChange, prioritizeEvents } from "@/lib/event-priority";
import { nlDate } from "@/lib/utils";

export type BoardEvent = {
  id: string;
  congressusEventId: number;
  name: string;
  startsAt: string;
  endsAt: string;
  closedAt: string | null;
  location: string | null;
  participationMode: string;
  registrations: number;
  checkIns: number;
};

export function EventList({ events, initialNow }: { events: BoardEvent[]; initialNow: string }) {
  const [now, setNow] = useState(() => new Date(initialNow));
  const sortedEvents = useMemo(() => prioritizeEvents(events, now), [events, now]);

  useEffect(() => {
    const boundary = nextTimingChange(events, now);
    if (boundary === null) return;
    const timer = window.setTimeout(() => setNow(new Date()), Math.min(2_147_000_000, Math.max(50, boundary - Date.now())));
    return () => window.clearTimeout(timer);
  }, [events, now]);

  return <div className="mt-7 grid gap-4 lg:gap-5">
    {sortedEvents.map(event => {
      const timing = eventTiming(event, now);
      const relevant = timing === "soon" || timing === "active";
      const state = timing === "closed" ? "Afgesloten" : timing === "active" ? "Nu bezig" : timing === "soon" ? "Begint binnenkort" : timing === "future" ? "Toekomstig" : "Afgelopen";
      const stateClass = timing === "active" ? "badge-success" : timing === "soon" ? "badge-warning" : timing === "future" ? "badge-brand" : "";
      const percentage = event.registrations ? Math.round(event.checkIns / event.registrations * 100) : 0;
      return <article key={event.id} className={`card card-interactive group relative grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center ${relevant ? "border-pink-200 bg-[linear-gradient(100deg,var(--brand-soft),white_42%)] shadow-[0_18px_48px_rgba(229,0,69,.11)]" : ""}`}>
        <a href={`/bestuur/activiteiten/${event.congressusEventId}`} className="absolute inset-0 rounded-[inherit]" aria-label={`${event.name} openen`}/>
        <div className="relative min-w-0 pointer-events-none">
          <div className="flex flex-wrap items-center gap-2"><span className={`badge ${stateClass}`}>{state}</span>{event.participationMode === "unknown" && <span className="badge badge-warning">Deelnamevorm onbekend</span>}</div>
          <h2 className="mt-3 truncate text-xl font-black text-slate-900 sm:text-2xl">{event.name}</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500"><span className="flex items-center gap-1.5"><CalendarDays size={16}/>{nlDate(event.startsAt)}</span>{event.location && <span className="flex items-center gap-1.5"><MapPin size={16}/>{event.location}</span>}</div>
        </div>
        <div className="relative pointer-events-none grid grid-cols-3 gap-2 rounded-2xl bg-white/80 p-3 text-center text-xs text-slate-500 sm:gap-6 sm:px-5 sm:text-sm">
          <div><b className="block text-xl text-slate-900">{event.registrations}</b>Aangemeld</div>
          <div><b className="block text-xl text-emerald-700">{event.checkIns}</b>Ingecheckt</div>
          <div><b className="block text-xl text-slate-900">{percentage}%</b>Aanwezig</div>
        </div>
        <div className="relative flex items-center justify-end gap-2">
          {relevant && <a href={`/bestuur/activiteiten/${event.congressusEventId}/scanner`} className="button min-h-11 px-3 text-sm"><ScanLine size={17}/>Scanner openen</a>}
          {!relevant && <span className="pointer-events-none grid size-11 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)] transition group-hover:bg-[var(--brand)] group-hover:text-white"><ChevronRight size={22}/><span className="sr-only">Openen</span></span>}
        </div>
      </article>;
    })}
    {events.length === 0 && <div className="card p-10 text-center text-slate-500"><Clock3 className="mx-auto mb-3 text-[var(--brand)]"/><p className="font-semibold">Nog geen activiteiten gesynchroniseerd.</p></div>}
  </div>;
}
