import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
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

  return <main className="min-h-[100dvh] pb-[max(1rem,env(safe-area-inset-bottom))]">
    <header className="topbar">
      <nav className="page-shell flex min-h-16 items-center justify-between gap-2 py-2">
        <Logo href="/dashboard" compactOnMobile/>
        <div className="flex items-center gap-1.5 sm:gap-2">{session.role === "BOARD" && <a className="button button-secondary px-2.5 text-xs sm:px-4 sm:text-sm" href="/bestuur">Bestuur</a>}<LogoutButton/></div>
      </nav>
    </header>
    {isDemo() && <div className="page-shell mt-3 rounded-xl bg-amber-100 p-2 text-center text-xs font-bold text-amber-800">Demo-modus — fictieve gegevens</div>}
    <section className="page-shell flex flex-col items-center py-4 sm:py-7">
      <h1 className="sr-only">Jouw persoonlijke RealTime QR-code</h1>
      <MemberQr/>
      <div className="mt-5 flex w-full max-w-[22rem] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><ShieldCheck size={21}/></span>
        <div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900">{user.name}</p><p className="truncate text-sm text-slate-500">{user.memberNumber || user.username || "RealTime-lid"}</p></div>
        <span className="badge badge-success shrink-0">Actief lid</span>
      </div>
    </section>
  </main>;
}
