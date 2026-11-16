"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Camera, CheckCircle2, Keyboard, Search, TriangleAlert, Volume2, VolumeX, XCircle } from "lucide-react";
import { createScannerAudio, feedbackFromResponse, SCAN_FEEDBACK_DURATION_MS, type ScanFeedback } from "@/components/scanner-feedback";
import { getCsrfToken } from "@/lib/csrf-client";

type Member = { id: string; name: string; memberNumber: string | null };
type CheckInBody = { code?: string; message?: string; member?: { name?: string }; syncStatus?: string };

function FeedbackOverlay({ feedback }: { feedback: ScanFeedback | null }) {
  if (!feedback) return null;
  const style = {
    processing: "border-white/20 bg-slate-950/90 text-white",
    success: "border-emerald-300/50 bg-emerald-950/90 text-white",
    duplicate: "border-amber-300/60 bg-amber-950/90 text-white",
    error: "border-red-300/60 bg-red-950/90 text-white",
  }[feedback.kind];
  const icon = feedback.kind === "processing"
    ? <span className="h-16 w-16 animate-spin rounded-full border-4 border-white/30 border-t-white motion-reduce:animate-none"/>
    : feedback.kind === "success"
      ? <span className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500"><CheckCircle2 size={52} strokeWidth={3}/></span>
      : feedback.kind === "duplicate"
        ? <span className="grid h-20 w-20 place-items-center rounded-full bg-amber-500"><TriangleAlert size={48} strokeWidth={3}/></span>
        : <span className="grid h-20 w-20 place-items-center rounded-full bg-red-500"><XCircle size={52} strokeWidth={3}/></span>;

  return <div className="absolute inset-0 z-30 grid place-items-center p-4" role="status" aria-live="assertive" aria-atomic="true">
    <div className={`flex w-full max-w-md flex-col items-center rounded-[1.75rem] border p-6 text-center shadow-2xl backdrop-blur-md motion-safe:animate-[scanner-feedback_.18s_ease-out] sm:p-8 ${style}`}>
      {icon}
      <p className="mt-4 text-2xl font-black leading-tight sm:text-3xl">{feedback.title}</p>
      {feedback.detail && <p className="mt-2 max-w-sm text-sm font-medium text-white/85 sm:text-base">{feedback.detail}</p>}
    </div>
  </div>;
}

export function Scanner({ eventId, members }: { eventId: number; members: Member[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const clearFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<ReturnType<typeof createScannerAudio> | null>(null);
  const [tab, setTab] = useState<"camera" | "usb" | "manual">("camera");
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  audio.current ??= createScannerAudio();

  function finish(feedbackResult: ScanFeedback) {
    setFeedback(feedbackResult);
    if (feedbackResult.kind !== "processing") {
      audio.current?.play(feedbackResult.kind);
      try {
        const pattern = feedbackResult.kind === "success" ? 120 : feedbackResult.kind === "duplicate" ? [80, 70, 80] : [160, 80, 160];
        navigator.vibrate?.(pattern);
      } catch {
        // Haptiek is optioneel en niet overal beschikbaar.
      }
    }
    if (clearFeedbackTimer.current) clearTimeout(clearFeedbackTimer.current);
    clearFeedbackTimer.current = setTimeout(() => {
      setFeedback(null);
      locked.current = false;
      input.current?.focus();
    }, SCAN_FEEDBACK_DURATION_MS);
  }

  async function send(body: Record<string, unknown>) {
    if (locked.current) return false;
    locked.current = true;
    setFeedback({ kind: "processing", title: "Scan controleren…" });
    try {
      const csrf = await getCsrfToken();
      const response = await fetch("/api/check-in", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ eventId, ...body }),
      });
      const json = await response.json().catch(() => ({})) as CheckInBody;
      finish(feedbackFromResponse(json, response.ok));
      return response.ok;
    } catch {
      finish({ kind: "error", title: "Verbindingsfout", detail: "De scan kon niet worden verstuurd. Controleer de verbinding en probeer opnieuw." });
      return false;
    }
  }

  async function submit(qrToken: string, method: "CAMERA" | "USB") {
    if (!qrToken.trim() || locked.current) return;
    if (input.current) input.current.value = "";
    await send({ method, qrToken: qrToken.trim() });
  }

  async function toggleSound() {
    if (soundEnabled) {
      audio.current?.disable();
      setSoundEnabled(false);
      return;
    }
    const enabled = await audio.current?.enable();
    setSoundEnabled(Boolean(enabled));
    setAudioUnavailable(!enabled);
  }

  useEffect(() => () => {
    if (clearFeedbackTimer.current) clearTimeout(clearFeedbackTimer.current);
  }, []);

  // `submit` gebruikt alleen stabiele props en refs; opnieuw starten van de camera bij elk render zou scans onderbreken.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void getCsrfToken().catch(() => undefined); if (tab !== "camera" || !video.current) return; let controls: { stop: () => void } | undefined; const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 1_200 }); setRunning(true); reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video.current, value => { if (value) void submit(value.getText(), "CAMERA"); }).then(value => controls = value).catch(() => finish({ kind: "error", title: "Camera niet beschikbaar", detail: "Controleer de cameratoestemming en probeer opnieuw." })); return () => { controls?.stop(); setRunning(false); }; }, [tab]);

  const tabClass = (active: boolean) => `flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-bold transition sm:text-base ${active ? "bg-white text-[var(--brand-dark)] shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white/60 hover:text-slate-800"}`;

  return <div>
    <div className="mb-4 flex justify-end">
      <button type="button" onClick={() => void toggleSound()} className="button button-secondary min-h-11 px-3 py-2 text-sm" aria-pressed={soundEnabled}>{soundEnabled ? <Volume2 size={17}/> : <VolumeX size={17}/>} {soundEnabled ? "Geluid aan" : "Geluid inschakelen"}</button>
    </div>
    {audioUnavailable && <p role="status" className="mb-3 text-right text-sm text-slate-500">Geluid is niet beschikbaar; scannen blijft gewoon werken.</p>}
    <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1.5" role="tablist" aria-label="Scanmethode">
      <button type="button" role="tab" aria-selected={tab === "camera"} onClick={() => setTab("camera")} className={tabClass(tab === "camera")}><Camera size={18}/>Camera</button>
      <button type="button" role="tab" aria-selected={tab === "usb"} onClick={() => setTab("usb")} className={tabClass(tab === "usb")}><Keyboard size={18}/>USB</button>
      <button type="button" role="tab" aria-selected={tab === "manual"} onClick={() => setTab("manual")} className={tabClass(tab === "manual")}><Search size={18}/>Zoeken</button>
    </div>
    <div className="relative min-h-48 overflow-hidden rounded-2xl">
      {tab === "camera" ? <div><div className="relative overflow-hidden rounded-2xl bg-slate-950"><video ref={video} className="aspect-[4/3] max-h-[68vh] w-full object-cover" muted playsInline/><div className="pointer-events-none absolute inset-[12%] rounded-3xl border-[3px] border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,.32)]"/><span className="absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/75 px-4 py-2 text-sm font-semibold text-white backdrop-blur">{running ? "Camera actief · richt op de QR-code" : "Camera starten…"}</span></div><p className="mt-3 text-center text-sm text-slate-500">Houd de volledige QR-code binnen het kader.</p></div>
        : tab === "usb" ? <form onSubmit={event => { event.preventDefault(); void submit(input.current?.value || "", "USB"); }} className="min-h-48 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6"><label className="mb-2 block font-bold text-slate-900">Scan een QR-code</label><input ref={input} autoFocus autoComplete="off" className="input text-lg" placeholder="Scannerinvoer…"/><p className="mt-2 text-sm text-slate-500">Het veld wordt na iedere scan automatisch leeggemaakt.</p></form>
        : <div><label className="mb-2 block font-bold text-slate-900">Zoek op naam of lidnummer</label><input className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Bijvoorbeeld Mila of RT-101"/><div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">{members.filter(member => `${member.name} ${member.memberNumber}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20).map(member => <button type="button" key={member.id} className="flex min-h-16 w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-pink-300 hover:bg-[var(--brand-soft)]" onClick={() => void send({ method: "MANUAL", memberId: member.id })}><span className="min-w-0"><b className="block truncate text-slate-900">{member.name}</b><small className="text-slate-500">{member.memberNumber || "Geen lidnummer"}</small></span><span className="badge badge-brand ml-3">Inchecken</span></button>)}</div></div>}
      <FeedbackOverlay feedback={feedback}/>
    </div>
  </div>;
}
