import { notFound } from "next/navigation";
import { ScanLine } from "lucide-react";
import { db } from "@/lib/db";
import { Scanner } from "@/components/scanner";

export default async function ScannerPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = Number((await params).eventId);
  const [event, members] = await Promise.all([db.eventCache.findUnique({ where: { congressusEventId: id } }), db.user.findMany({ where: { active: true }, select: { id: true, name: true, memberNumber: true }, orderBy: { name: "asc" } })]);
  if (!event) notFound();

  return <main className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-4 sm:py-9">
    <a href={`/bestuur/activiteiten/${id}`} className="inline-flex min-h-11 items-center font-bold text-[var(--brand-dark)] hover:underline">← Activiteitdashboard</a>
    <div className="mt-3 flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><ScanLine/></span><div><p className="eyebrow">Inchecken</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{event.name}</h1></div></div>
    <div className="card mt-6 p-3 sm:p-6"><Scanner eventId={id} members={members}/></div>
  </main>;
}
