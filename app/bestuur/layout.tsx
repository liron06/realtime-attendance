import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";

export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "BOARD") redirect("/dashboard");

  return <>
    <header className="topbar sticky top-0 z-30">
      <nav className="page-shell flex items-center justify-between py-3 sm:py-4">
        <Logo href="/bestuur"/>
        <div className="flex items-center gap-2"><a className="button button-secondary text-sm" href="/dashboard">Mijn QR</a><LogoutButton/></div>
      </nav>
    </header>
    {children}
  </>;
}
