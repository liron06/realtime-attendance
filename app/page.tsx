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
  const session = await getSession(); if (session) redirect("/dashboard");
  const errorMessage = messages[(await searchParams).fout ?? ""];
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#c8f1d8,transparent_40%)] px-5"><nav className="mx-auto flex max-w-6xl items-center justify-between py-6"><Logo/><span className="badge">S.V. RealTime</span></nav><section className="mx-auto grid max-w-6xl items-center gap-12 py-16 md:grid-cols-2 md:py-28"><div><p className="mb-3 font-bold uppercase tracking-[.2em] text-emerald-700">Aanwezig in seconden</p><h1 className="text-5xl font-black leading-[1.05] tracking-tight md:text-7xl">Jouw QR.<br/>Snel gescand.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Log veilig in met Congressus, toon je persoonlijke QR-code en laat je aanwezigheid registreren bij activiteiten van S.V. RealTime.</p>{errorMessage && <div role="alert" className="mt-6 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-900">{errorMessage}</div>}<div className="mt-9 flex flex-wrap gap-3"><a className="button" href="/api/auth/login">Inloggen met Congressus</a>{isDemo() && <a className="button button-secondary" href="/api/auth/demo?role=member">Demo bekijken</a>}</div>{isDemo() && <p className="mt-5 text-sm font-semibold text-amber-700">Demo-modus actief — er worden fictieve gegevens gebruikt.</p>}</div><div className="card mx-auto w-full max-w-md p-8"><div className="mx-auto grid aspect-square max-w-64 place-items-center rounded-3xl bg-emerald-50"><div className="grid grid-cols-5 gap-2">{Array.from({length:25},(_,i)=><span key={i} className={`size-8 rounded-sm ${[0,1,2,5,7,10,11,12,14,17,20,21,22,24].includes(i)?"bg-emerald-950":"bg-white"}`}/>)}</div></div><h2 className="mt-7 text-center text-xl font-bold">Persoonlijk en tijdelijk</h2><p className="mt-2 text-center text-slate-500">Je QR-code bevat geen leesbare persoonsgegevens en vernieuwt automatisch.</p></div></section></main>;
}
