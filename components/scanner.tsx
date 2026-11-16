"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, CheckCircle2, Keyboard, Search, TriangleAlert } from "lucide-react";
import { getCsrfToken } from "@/lib/csrf-client";

type Result = { type: "success" | "error"; message: string; sync?: string };
type Member = { id: string; name: string; memberNumber: string | null };

export function Scanner({ eventId, members }: { eventId: number; members: Member[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"camera" | "usb" | "manual">("camera");
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const last = useRef({ value: "", at: 0 });

  async function send(body: Record<string, unknown>) { try { const csrf = await getCsrfToken(); const response = await fetch("/api/check-in", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, body: JSON.stringify({ eventId, ...body }) }); const json = await response.json(); setResult({ type: response.ok ? "success" : "error", message: json.message, sync: json.syncStatus }); if (response.ok) navigator.vibrate?.(120); return response.ok; } catch { setResult({ type: "error", message: "De beveiligde sessie kon niet worden voorbereid. Vernieuw de pagina en probeer opnieuw." }); return false; } }
  async function submit(qrToken: string, method: "CAMERA" | "USB") { if (!qrToken.trim()) return; const now = Date.now(); if (last.current.value === qrToken && now - last.current.at < 3_000) return; last.current = { value: qrToken, at: now }; await send({ method, qrToken: qrToken.trim() }); if (input.current) { input.current.value = ""; input.current.focus(); } }

  // `submit` gebruikt alleen stabiele props en refs; opnieuw starten van de camera bij elk render zou scans onderbreken.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void getCsrfToken().catch(() => undefined); if (tab !== "camera" || !video.current) return; let controls: { stop: () => void } | undefined; const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 1_200 }); setRunning(true); reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video.current, value => { if (value) void submit(value.getText(), "CAMERA"); }).then(value => controls = value).catch(() => setResult({ type: "error", message: "De camera kon niet worden gestart. Controleer de toestemming." })); return () => { controls?.stop(); setRunning(false); }; }, [tab]);

  const tabClass = (active: boolean) => `flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-bold transition sm:text-base ${active ? "bg-white text-[var(--brand-dark)] shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/60 hover:text-slate-800"}`;

  return <div>
    <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1.5" role="tablist" aria-label="Scanmethode">
      <button type="button" role="tab" aria-selected={tab === "camera"} onClick={() => setTab("camera")} className={tabClass(tab === "camera")}><Camera size={18}/>Camera</button>
      <button type="button" role="tab" aria-selected={tab === "usb"} onClick={() => setTab("usb")} className={tabClass(tab === "usb")}><Keyboard size={18}/>USB</button>
      <button type="button" role="tab" aria-selected={tab === "manual"} onClick={() => setTab("manual")} className={tabClass(tab === "manual")}><Search size={18}/>Zoeken</button>
    </div>
    {tab === "camera" ? <div><div className="relative overflow-hidden rounded-2xl bg-slate-950"><video ref={video} className="aspect-[4/3] max-h-[68vh] w-full object-cover" muted playsInline/><div className="pointer-events-none absolute inset-[12%] rounded-3xl border-[3px] border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,.32)]"/><span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/75 px-4 py-2 text-sm font-semibold text-white backdrop-blur">{running ? "Camera actief · richt op de QR-code" : "Camera starten…"}</span></div><p className="mt-3 text-center text-sm text-slate-500">Houd de volledige QR-code binnen het kader.</p></div>
      : tab === "usb" ? <form onSubmit={event => { event.preventDefault(); void submit(input.current?.value || "", "USB"); }} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6"><label className="mb-2 block font-bold text-slate-900">Scan een QR-code</label><input ref={input} autoFocus autoComplete="off" className="input text-lg" placeholder="Scannerinvoer…"/><p className="mt-2 text-sm text-slate-500">Het veld wordt na iedere scan automatisch leeggemaakt.</p></form>
      : <div><label className="mb-2 block font-bold text-slate-900">Zoek op naam of lidnummer</label><input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Bijvoorbeeld Mila of RT-101"/><div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">{members.filter(member => `${member.name} ${member.memberNumber}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20).map(member => <button type="button" key={member.id} className="flex min-h-16 w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-pink-300 hover:bg-[var(--brand-soft)]" onClick={() => void send({ method: "MANUAL", memberId: member.id })}><span className="min-w-0"><b className="block truncate text-slate-900">{member.name}</b><small className="text-slate-500">{member.memberNumber || "Geen lidnummer"}</small></span><span className="badge badge-brand ml-3">Inchecken</span></button>)}</div></div>}
    {result && <div role="status" className={`mt-5 flex gap-3 rounded-2xl border p-5 font-bold ${result.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>{result.type === "success" ? <CheckCircle2 className="shrink-0 text-emerald-700"/> : <TriangleAlert className="shrink-0 text-red-700"/>}<div><p>{result.message}</p>{result.sync === "PENDING" && <p className="mt-1 text-sm font-normal">Lokaal opgeslagen · synchronisatie met Congressus staat klaar.</p>}</div></div>}
  </div>;
}
