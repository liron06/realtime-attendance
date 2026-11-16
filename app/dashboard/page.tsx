import { redirect } from "next/navigation";
import { ShieldCheck, UserRound } from "lucide-react";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { isDemo } from "@/lib/env";
import { MemberQr } from "@/components/member-qr";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/");
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) redirect("/");

  return <main className="min-h-screen pb-12">
    <header className="topbar">
      <nav className="page-shell flex items-center justify-between py-4">
        <Logo href="/dashboard"/>
        <div className="flex items-center gap-2">{session.role === "BOARD" && <a className="button button-secondary text-sm" href="/bestuur">Bestuur</a>}<LogoutButton/></div>
      </nav>
    </header>
    {isDemo() && <div className="page-shell mt-4 rounded-xl bg-amber-100 p-3 text-center text-sm font-bold text-amber-800">Demo-modus — alle getoonde gegevens zijn fictief.</div>}
    <section className="page-shell grid gap-5 py-6 md:grid-cols-[.9fr_1.1fr] md:py-10 lg:gap-7">
      <div className="card overflow-hidden">
        <div className="h-1.5 bg-[var(--brand)]"/>
        <div className="p-6 md:p-8">
          <p className="eyebrow">Welkom terug</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Hoi, {user.firstName || user.name.split(" ")[0]}!</h1>
          <p className="mt-3 leading-6 text-slate-500">Hier vind je jouw persoonlijke ledenpas voor activiteiten van S.V. RealTime.</p>
          <div className="mt-8 flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><UserRound/></span>
            <div className="min-w-0"><p className="truncate font-bold text-slate-900">{user.name}</p><p className="truncate text-sm text-slate-500">{user.memberNumber || user.username || "RealTime-lid"}</p></div>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <ShieldCheck className="shrink-0 text-emerald-700"/>
            <div><p className="font-bold">Lidmaatschap actief</p><p className="text-sm text-emerald-800">{user.memberStatus || "Actief lid"}</p></div>
          </div>
        </div>
      </div>
      <div className="card p-5 sm:p-6 md:p-8">
        <p className="eyebrow text-center">Persoonlijke ledenpas</p>
        <h2 className="mt-2 text-center text-2xl font-black tracking-tight text-slate-900">Jouw RealTime QR-code</h2>
        <p className="mx-auto mb-6 mt-2 max-w-sm text-center leading-6 text-slate-500">Laat deze code scannen door een bestuurslid. Deel hem niet met anderen.</p>
        <MemberQr/>
      </div>
    </section>
  </main>;
}
