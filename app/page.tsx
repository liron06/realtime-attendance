import { LockKeyhole, QrCode, RefreshCw } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Logo } from "@/components/logo";
import { isDemo } from "@/lib/env";

const messages: Record<string, string> = {
  "ongeldige-state": "Deze inlogpoging is verlopen of ongeldig. Probeer opnieuw in te loggen.",
  "toegang-geweigerd": "Congressus heeft geen toestemming gegeven. Je kunt het opnieuw proberen.",
  "inactief-lid": "Je Congressus-lidmaatschap is niet actief. Neem contact op met het bestuur als dit niet klopt.",
  "account-koppeling": "Je Congressus-account kon niet eenduidig aan het ledenbestand worden gekoppeld. Neem contact op met het bestuur.",
  "ledenservice-onbeschikbaar": "Het ledenbestand van Congressus is tijdelijk niet bereikbaar. Probeer het later opnieuw.",
  "account-opslaan-mislukt": "Je account is geverifieerd, maar kon niet worden opgeslagen. Probeer het later opnieuw.",
  "sessie-mislukt": "Inloggen is gelukt, maar de veilige sessie kon niet worden gestart. Probeer opnieuw.",
  "authenticatie-mislukt": "Congressus kon de inlogpoging niet afronden. Probeer het opnieuw of neem contact op met het bestuur.",
  "configuratie": "Inloggen is tijdelijk niet beschikbaar door een configuratieprobleem.",
  "voer-seed-uit": "De demo-accounts zijn nog niet aangemaakt. Voer eerst de demo-seed uit."
};

export default async function Home({ searchParams }: { searchParams: Promise<{ fout?: string }> }) {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const errorMessage = messages[(await searchParams).fout ?? ""];

  return <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_82%_8%,rgba(229,0,69,.14),transparent_28rem)]">
    <nav className="page-shell flex items-center justify-between py-5 sm:py-7">
      <Logo/>
      <span className="badge badge-brand">Attendance</span>
    </nav>
    <section className="page-shell grid items-center gap-12 pb-16 pt-8 lg:grid-cols-[1.08fr_.92fr] lg:gap-20 lg:pb-24 lg:pt-20">
      <div>
        <p className="eyebrow mb-4">S.V. RealTime · aanwezigheidsregistratie</p>
        <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-[-.045em] text-slate-900 sm:text-6xl lg:text-7xl">Jouw QR.<br/><span className="text-[var(--brand)]">Snel gescand.</span></h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Log veilig in met Congressus, toon je persoonlijke QR-code en laat je aanwezigheid registreren bij activiteiten van S.V. RealTime.</p>
        {errorMessage && <div role="alert" className="mt-6 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-900">{errorMessage}</div>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a className="button sm:min-w-56" href="/api/auth/login"><LockKeyhole size={18}/>Inloggen met Congressus</a>
          {isDemo() && <a className="button button-secondary" href="/api/auth/demo?role=member">Demo bekijken</a>}
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><LockKeyhole size={15}/>Je logt in via de beveiligde omgeving van Congressus.</p>
        {isDemo() && <p className="mt-4 text-sm font-semibold text-amber-700">Demo-modus actief — er worden fictieve gegevens gebruikt.</p>}
      </div>

      <div className="card relative mx-auto w-full max-w-md overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-[var(--brand)]"/>
        <div className="mx-auto grid aspect-square max-w-64 place-items-center rounded-[2rem] bg-[var(--brand-soft)] p-7 ring-1 ring-pink-100">
          <div className="grid grid-cols-5 gap-2" aria-hidden="true">{Array.from({ length: 25 }, (_, index) => <span key={index} className={`size-7 rounded-[3px] sm:size-8 ${[0,1,2,5,7,10,11,12,14,17,20,21,22,24].includes(index) ? "bg-slate-950" : "bg-white"}`}/>)}</div>
        </div>
        <h2 className="mt-7 text-center text-xl font-bold text-slate-900">Persoonlijk, veilig en tijdelijk</h2>
        <p className="mt-2 text-center leading-6 text-slate-500">Je QR-code bevat geen leesbare persoonsgegevens en vernieuwt automatisch.</p>
        <div className="mt-6 grid grid-cols-2 gap-3 text-sm font-semibold text-slate-600">
          <span className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><QrCode size={17} className="text-[var(--brand)]"/>Direct scanbaar</span>
          <span className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><RefreshCw size={17} className="text-[var(--brand)]"/>Automatisch vernieuwd</span>
        </div>
      </div>
    </section>
  </main>;
}
