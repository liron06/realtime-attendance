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
  return <main className="min-h-screen px-4 pb-12"><nav className="mx-auto flex max-w-5xl items-center justify-between py-5"><Logo/><div className="flex items-center gap-2">{session.role === "BOARD" && <a className="button button-secondary text-sm" href="/bestuur">Bestuur</a>}<LogoutButton/></div></nav>{isDemo() && <div className="mx-auto mb-4 max-w-5xl rounded-xl bg-amber-100 p-3 text-center text-sm font-bold text-amber-800">Demo-modus — alle getoonde gegevens zijn fictief.</div>}<section className="mx-auto grid max-w-5xl gap-5 md:grid-cols-[1fr_1.2fr]"><div className="card p-6 md:p-8"><p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Welkom terug</p><h1 className="mt-2 text-4xl font-black">Hoi, {user.firstName || user.name.split(" ")[0]}!</h1><div className="mt-8 flex items-center gap-4 rounded-2xl bg-slate-50 p-4"><span className="grid size-12 place-items-center rounded-full bg-emerald-100"><UserRound/></span><div><p className="font-bold">{user.name}</p><p className="text-sm text-slate-500">{user.memberNumber || user.username || "RealTime-lid"}</p></div></div><div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><ShieldCheck/><div><p className="font-bold">Lidmaatschap actief</p><p className="text-sm">{user.memberStatus || "Actief lid"}</p></div></div></div><div className="card p-6 md:p-8"><h2 className="text-center text-2xl font-black">Jouw persoonlijke RealTime QR-code</h2><p className="mx-auto mb-6 mt-2 max-w-sm text-center text-slate-500">Laat deze code scannen door een bestuurslid. Deel hem niet met anderen.</p><MemberQr/></div></section></main>;
}
