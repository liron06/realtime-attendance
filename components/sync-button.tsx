"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { clearCsrfTokenCache, getCsrfToken } from "@/lib/csrf-client";

type SyncResponse = { ok?: boolean; code?: string; message?: string; requestId?: string };
type Notice = { kind: "success" | "error"; text: string } | null;

export function SyncButton() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const router = useRouter();
  useEffect(() => { void getCsrfToken().catch(() => undefined); }, []);

  async function synchronize() {
    setBusy(true);
    setNotice(null);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch("/api/admin/sync", { method: "POST", credentials: "same-origin", headers: { "x-csrf-token": csrf } });
      const body = await response.json().catch(() => ({})) as SyncResponse;
      if (!response.ok || body.ok === false) {
        if (body.code === "SYNC_CSRF_INVALID") clearCsrfTokenCache();
        const reference = [body.code && `Foutcode: ${body.code}`, body.requestId && `referentie: ${body.requestId}`].filter(Boolean).join(" · ");
        setNotice({ kind: "error", text: `${body.message ?? "Synchronisatie is niet gelukt."}${reference ? ` ${reference}` : ""}` });
        return;
      }
      setNotice({ kind: "success", text: body.message ?? "Synchronisatie voltooid." });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "De synchronisatieservice is niet bereikbaar. Controleer je verbinding en probeer opnieuw." });
    } finally {
      setBusy(false);
    }
  }

  return <div className="w-full max-w-xl sm:w-auto">
    <button disabled={busy} className="button w-full sm:w-auto" onClick={synchronize}><RefreshCw className={busy ? "animate-spin" : ""} size={18}/>{busy ? "Synchroniseren…" : "Synchroniseer Congressus"}</button>
    {notice && <p role="status" aria-live="polite" className={`mt-2 max-w-md text-sm font-semibold ${notice.kind === "error" ? "text-red-700" : "text-emerald-700"}`}>{notice.text}</p>}
  </div>;
}
