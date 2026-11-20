import { notFound } from "next/navigation";
import { AlertTriangle, Download, ScanLine, UserCheck, Users } from "lucide-react";
import { db } from "@/lib/db";
import { nlDate, nlTime } from "@/lib/utils";
import { attendanceOverview } from "@/lib/attendance-stats";

export default async function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = Number((await params).eventId);
  if (!Number.isInteger(id)) notFound();
  const event = await db.eventCache.findUnique({ where: { congressusEventId: id }, include: { participations: { orderBy: { memberName: "asc" } }, checkIns: { include: { member: true, scanner: true }, orderBy: { checkedInAt: "desc" } } } });
  if (!event) notFound();
  const overview = attendanceOverview(event.participationMode, event.participations, event.checkIns);
  const checkInsById = new Map(event.checkIns.map(checkIn => [checkIn.id, checkIn]));
  const memberLabels = overview.unit === "members";
  const excludedRecords = overview.ignoredParticipations + overview.unidentifiedRegistrations;
  const representedCheckIns = new Set(overview.rows.flatMap(row => row.checkInId ? [row.checkInId] : []));
  const additionalCheckIns = event.checkIns.filter(checkIn => !representedCheckIns.has(checkIn.id));

  return <main className="page-shell py-7 sm:py-10">
    <a href="/bestuur" className="inline-flex min-h-11 items-center font-bold text-[var(--brand-dark)] hover:underline">← Alle activiteiten</a>
    <div className="mt-3 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
      <div className="min-w-0"><p className="eyebrow">Activiteitdashboard</p><h1 className="mt-1 break-words text-3xl font-black tracking-tight text-slate-900 sm:text-5xl">{event.name}</h1><p className="mt-2 text-slate-500">{nlDate(event.startsAt)}{event.location && ` · ${event.location}`}</p></div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><a className="button button-secondary" href={`/api/events/${id}/export`}><Download size={18}/>CSV exporteren</a><a className="button" href={`/bestuur/activiteiten/${id}/scanner`}><ScanLine size={18}/>Scanner openen</a></div>
    </div>
    {event.participationMode === "unknown" && <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="shrink-0"/><div><p className="font-bold">Deelnamevorm onbekend</p><p className="mt-1 text-sm leading-6">Check-ins zijn geblokkeerd totdat de deelnamevorm in Congressus bekend is.</p></div></div>}
    <section className="mt-7 grid gap-4 sm:grid-cols-3">
      <div className="card stat-card p-5 pl-6"><Users className="text-[var(--brand)]"/><b className="mt-3 block text-3xl text-slate-900">{overview.registered}</b><span className="text-slate-500">{memberLabels ? "Aangemelde leden" : "Geldige tickets"}</span></div>
      <div className="card stat-card p-5 pl-6"><UserCheck className="text-emerald-700"/><b className="mt-3 block text-3xl text-emerald-700">{overview.checkedIn}</b><span className="text-slate-500">{memberLabels ? "Ingecheckte leden" : "Ingecheckte tickets"}</span>{memberLabels && overview.exceptionCheckIns > 0 && <small className="mt-1 block text-slate-400">waarvan {overview.exceptionCheckIns} via uitzondering</small>}</div>
      <div className="card stat-card p-5 pl-6"><b className="block text-3xl text-slate-900">{overview.notCheckedIn}</b><span className="mt-3 block text-slate-500">Nog niet ingecheckt</span><small className="mt-1 block text-slate-400">Geen definitieve afwezigheidsstatus</small></div>
    </section>
    {(excludedRecords > 0 || overview.duplicateRegistrations > 0 || overview.unmatchedCheckIns > 0 || (!memberLabels && overview.exceptionCheckIns > 0)) && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Telcontrole</p><ul className="mt-1 list-disc space-y-1 pl-5">{overview.duplicateRegistrations > 0 && <li>{overview.duplicateRegistrations} dubbele {memberLabels ? "deelname(s)" : "ticketregistratie(s)"} samengevoegd op stabiele Congressus-ID.</li>}{excludedRecords > 0 && <li>{excludedRecords} ongeldige of niet betrouwbaar identificeerbare registratie(s) niet meegeteld.</li>}{overview.unmatchedCheckIns > 0 && <li>{overview.unmatchedCheckIns} reguliere check-in(s) konden niet veilig aan een geldige registratie worden gekoppeld.</li>}{!memberLabels && overview.exceptionCheckIns > 0 && <li>{overview.exceptionCheckIns} uitzonderingscheck-in(s) zijn personen en daarom niet als ticket geteld.</li>}</ul></div>}
    <div className="card mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="text-xl font-black text-slate-900">{memberLabels ? "Aangemelde leden" : "Geldige tickets"}</h2><p className="mt-1 text-sm text-slate-500">Alleen geldige, betrouwbaar identificeerbare registraties.</p></div><span className="badge">{overview.registered} totaal</span></div>
      <div className="overflow-x-auto">
        <table className="data-table"><thead><tr><th>{memberLabels ? "Naam" : "Tickethouder"}</th><th>Aanmelding</th><th>Aanwezigheid</th><th>Scan</th><th>Synchronisatie</th></tr></thead><tbody>{overview.rows.map(row => {
          const checkIn = row.checkInId ? checkInsById.get(row.checkInId) : undefined;
          const syncClass = checkIn?.syncStatus === "SYNCED" ? "badge-success" : checkIn?.syncStatus === "FAILED" ? "badge-danger" : checkIn ? "badge-warning" : "";
          return <tr key={row.key}><td className="font-bold text-slate-900">{row.name}<small className="block font-normal text-slate-400">{row.memberNumber}{row.ticketId !== null && ` · ticket ${row.ticketId}`}</small></td><td>{row.status}</td><td>{checkIn ? <span className="badge badge-success">Aanwezig · {nlTime(checkIn.checkedInAt)}</span> : <span className="text-slate-400">Nog niet ingecheckt</span>}</td><td>{checkIn?.method || "—"}</td><td>{checkIn ? <span className={`badge ${syncClass}`}>{checkIn.syncStatus}</span> : "—"}</td></tr>;
        })}</tbody></table>
      </div>
    </div>
    {additionalCheckIns.length > 0 && <div className="card mt-6 overflow-hidden">
      <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-black text-slate-900">Overige check-ins</h2><p className="mt-1 text-sm text-slate-500">Werkelijke check-ins die niet van een geldige, identificeerbare inschrijving zijn afgetrokken.</p></div>
      <div className="divide-y divide-slate-100">{additionalCheckIns.map(checkIn => <div key={checkIn.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5"><div><p className="font-bold text-slate-900">{checkIn.member.name}</p><p className="text-sm text-slate-500">{checkIn.member.memberNumber || "Geen lidnummer"} · {nlTime(checkIn.checkedInAt)}</p></div><span className={`badge ${checkIn.exception ? "badge-warning" : "badge-danger"}`}>{checkIn.exception ? "Uitzondering" : "Niet gekoppeld"}</span></div>)}</div>
    </div>}
  </main>;
}
