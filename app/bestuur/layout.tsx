import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";

export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== "BOARD") redirect("/dashboard");
  return <><header className="border-b border-slate-200 bg-white"><nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4"><Logo/><div className="flex gap-2"><a className="button button-secondary text-sm" href="/dashboard">Mijn QR</a><LogoutButton/></div></nav></header>{children}</>;
}
