import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Scanner } from "@/components/scanner";

export default async function ScannerPage({ params }: { params: Promise<{ eventId: string }> }) {
  const id = Number((await params).eventId);
  const [event, members] = await Promise.all([db.eventCache.findUnique({ where: { congressusEventId: id } }), db.user.findMany({ where: { active: true }, select: { id: true, name: true, memberNumber: true }, orderBy: { name: "asc" } })]);
  if (!event) notFound();

  return <main className="sm:mx-auto sm:w-full sm:max-w-4xl sm:px-4 sm:py-9">
    <div className="hidden sm:mb-4 sm:block"><a href={`/bestuur/activiteiten/${id}`} className="inline-flex min-h-11 items-center font-bold text-[var(--brand-dark)] hover:underline">← Activiteitdashboard</a></div>
    <div className="sm:card sm:p-3"><Scanner eventId={id} eventName={event.name} backHref={`/bestuur/activiteiten/${id}`} members={members}/></div>
  </main>;
}
