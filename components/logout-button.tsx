"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearCsrfTokenCache, getCsrfToken } from "@/lib/csrf-client";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <button disabled={busy} className="button button-secondary text-sm" onClick={async () => {
    setBusy(true);
    try {
      const csrf = await getCsrfToken();
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "x-csrf-token": csrf } });
      if (!response.ok) throw new Error("LOGOUT_FAILED");
      clearCsrfTokenCache();
      router.replace("/");
      router.refresh();
    } catch { setBusy(false); alert("Uitloggen is niet gelukt. Probeer het opnieuw."); }
  }}>{busy ? "Uitloggen…" : "Uitloggen"}</button>;
}
