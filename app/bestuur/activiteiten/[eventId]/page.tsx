import { notFound } from "next/navigation";
import { AlertTriangle, Download, ScanLine, UserCheck, Users } from "lucide-react";
import { db } from "@/lib/db";
import { nlDate, nlTime } from "@/lib/utils";

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = Number((await params).eventId);
  if (!Number.isInteger(id)) notFound();
  const event = await db.eventCache.findUnique({ where: { congressusEventId: id }, include: { participations: { orderBy: { memberName: "asc" } }, checkIns: { include: { member: true, scanner: true }, orderBy: { checkedInAt: "desc" } } } });
  if (!event) notFound();
  const checked = new Map(event.checkIns.map(checkIn => [checkIn.member.congressusMemberId, checkIn]));

  return <main className="page-shell py-7 sm:py-10">
    <a href="/bestuur" className="inline-flex min-h-11 items-center font-bold text-[var(--brand-dark)] hover:underline">← Alle activiteiten</a>
    <div className="mt-3 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
      <div className="min-w-0"><p className="eyebrow">Activiteitdashboard</p><h1 className="mt-1 break-words text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">{event.name}</h1><p className="mt-2 text-slate-500">{nlDate(event.startsAt)}{event.location && ` · ${event.location}`}</p></div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><a className="button button-secondary" href={`/api/events/${id}/export`}><Download size={18}/>CSV exporteren</a><a className="button" href={`/bestuur/activiteiten/${id}/scanner`}><ScanLine size={18}/>Scanner openen</a></div>
    </div>
    {event.participationMode === "unknown" && <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="shrink-0"/><div><p className="font-bold">Deelnamevorm onbekend</p><p className="mt-1 text-sm leading-6">Check-ins zijn geblokkeerd totdat de deelnamevorm in Congressus bekend is.</p></div></div>}
    <section className="mt-7 grid gap-4 sm:grid-cols-3">
      <div className="card stat-card p-5 pl-6"><Users className="text-[var(--brand)]"/><b className="mt-3 block text-3xl text-slate-900">{event.participations.length}</b><span className="text-slate-500">Aanmeldingen</span></div>
      <div className="card stat-card p-5 pl-6"><UserCheck className="text-emerald-700"/><b className="mt-3 block text-3xl text-emerald-700">{event.checkIns.length}</b><span className="text-slate-500">Ingecheckt</span></div>
      <div className="card stat-card p-5 pl-6"><b className="block text-3xl text-slate-900">{Math.max(0, event.participations.length - event.checkIns.filter(checkIn => !checkIn.exception).length)}</b><span className="mt-3 block text-slate-500">Nog niet ingecheckt</span></div>
    </section>
    <div className="card mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="text-xl font-black text-slate-900">Deelnemers</h2><p className="mt-1 text-sm text-slate-500">Aanmeldingen en synchronisatiestatus per lid.</p></div><span className="badge">{event.participations.length} totaal</span></div>
      <div className="overflow-x-auto">
        <table className="data-table"><thead><tr><th>Naam</th><th>Aanmelding</th><th>Aanwezigheid</th><th>Scan</th><th>Synchronisatie</th></tr></thead><tbody>{event.participations.map(participation => {
          const checkIn = checked.get(participation.congressusMemberId);
          const syncClass = checkIn?.syncStatus === "SYNCED" ? "badge-success" : checkIn?.syncStatus === "FAILED" ? "badge-danger" : checkIn ? "badge-warning" : "";
          return <tr key={participation.id}><td className="font-bold text-slate-900">{participation.memberName}<small className="block font-normal text-slate-400">{participation.memberNumber}</small></td><td>{participation.status}</td><td>{checkIn ? <span className="badge badge-success">Aanwezig · {nlTime(checkIn.checkedInAt)}</span> : <span className="text-slate-400">Niet gescand</span>}</td><td>{checkIn?.method || "—"}</td><td>{checkIn ? <span className={`badge ${syncClass}`}>{checkIn.syncStatus}</span> : "—"}</td></tr>;
        })}</tbody></table>
      </div>
    </div>
  </main>;
}
