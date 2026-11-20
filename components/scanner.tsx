"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { ArrowLeft, CheckCircle2, Search, TriangleAlert, Volume2, VolumeX, X, XCircle } from "lucide-react";
import { createScannerAudio, feedbackFromResponse, SCAN_FEEDBACK_DURATION_MS, type ScanFeedback } from "@/components/scanner-feedback";
import { getCsrfToken } from "@/lib/csrf-client";

const SOUND_PREFERENCE_KEY = "realtime-scanner-sound";
const SAME_TOKEN_COOLDOWN_MS = 3_000;

function storeSoundPreference(value: "on" | "off") {
  try { window.localStorage.setItem(SOUND_PREFERENCE_KEY, value); } catch { /* Opslag is optioneel, bijvoorbeeld in privémodus. */ }
}

function hasSoundPreference() {
  try { return window.localStorage.getItem(SOUND_PREFERENCE_KEY) === "on"; } catch { return false; }
}

type Member = { id: string; name: string; memberNumber: string | null };
type CheckInBody = { code?: string; message?: string; member?: { name?: string }; syncStatus?: string; exception?: boolean };
type PendingException = { body: Record<string, unknown>; message: string };

function FeedbackOverlay({ feedback }: { feedback: ScanFeedback | null }) {
  if (!feedback) return null;
  const style = {
    processing: "border-white/20 bg-slate-950/95 text-white",
    success: "border-emerald-300/50 bg-emerald-950/95 text-white",
    duplicate: "border-amber-300/60 bg-amber-950/95 text-white",
    error: "border-red-300/60 bg-red-950/95 text-white",
  }[feedback.kind];
  const icon = feedback.kind === "processing"
    ? <span className="h-14 w-14 animate-spin rounded-full border-4 border-white/30 border-t-white motion-reduce:animate-none"/>
    : feedback.kind === "success"
      ? <span className="grid size-16 place-items-center rounded-full bg-emerald-500"><CheckCircle2 size={42} strokeWidth={3}/></span>
      : feedback.kind === "duplicate"
        ? <span className="grid size-16 place-items-center rounded-full bg-amber-500"><TriangleAlert size={38} strokeWidth={3}/></span>
        : <span className="grid size-16 place-items-center rounded-full bg-red-500"><XCircle size={42} strokeWidth={3}/></span>;

  return <div className="pointer-events-auto absolute inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 sm:inset-x-6 sm:bottom-6" role="status" aria-live="assertive" aria-atomic="true">
    <div className={`mx-auto flex w-full max-w-lg items-center gap-4 rounded-[1.5rem] border p-5 shadow-2xl backdrop-blur-md motion-safe:animate-[scanner-feedback_.18s_ease-out] sm:p-6 ${style}`}>
      {icon}
      <div className="min-w-0">
        <p className="text-2xl font-black leading-tight sm:text-3xl">{feedback.title}</p>
        {feedback.detail && <p className="mt-1 text-base font-bold text-white/95 sm:text-lg">{feedback.detail}</p>}
        {feedback.note && <p className="mt-1 text-xs font-medium text-white/75 sm:text-sm">{feedback.note}</p>}
      </div>
    </div>
  </div>;
}

export function Scanner({ eventId, eventName, backHref, members }: { eventId: number; eventName: string; backHref: string; members: Member[] }) {
  const video = useRef<HTMLVideoElement>(null);
  const locked = useRef(false);
  const lastToken = useRef({ value: "", at: 0 });
  const clearFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<ReturnType<typeof createScannerAudio> | null>(null);
  const [mode, setMode] = useState<"camera" | "manual">("camera");
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [pendingException, setPendingException] = useState<PendingException | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionReasonError, setExceptionReasonError] = useState("");

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
    }, SCAN_FEEDBACK_DURATION_MS);
  }

  async function send(body: Record<string, unknown>, continueLocked = false) {
    if (locked.current && !continueLocked) return false;
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
      if (!response.ok && json.code === "NOT_REGISTERED" && body.allowException !== true) {
        setFeedback(null);
        setPendingException({ body, message: json.message ?? "Dit lid is niet aangemeld voor deze activiteit." });
        setExceptionReason("");
        setExceptionReasonError("");
        return false;
      }
      finish(feedbackFromResponse(json, response.ok));
      return response.ok;
    } catch {
      finish({ kind: "error", title: "Verbindingsfout", detail: "Controleer de verbinding en probeer opnieuw." });
      return false;
    }
  }

  function cancelException() {
    setPendingException(null);
    setExceptionReason("");
    setExceptionReasonError("");
    locked.current = false;
  }

  async function confirmException() {
    if (!pendingException) return;
    const reason = exceptionReason.trim();
    if (reason.length < 3) {
      setExceptionReasonError("Vul een korte reden van minimaal 3 tekens in.");
      return;
    }
    const body = pendingException.body;
    setPendingException(null);
    setExceptionReasonError("");
    await send({ ...body, allowException: true, reason }, true);
  }

  async function submit(qrToken: string) {
    const token = qrToken.trim();
    if (!token || locked.current) return;
    const now = Date.now();
    if (lastToken.current.value === token && now - lastToken.current.at < SAME_TOKEN_COOLDOWN_MS) return;
    lastToken.current = { value: token, at: now };
    await send({ method: "CAMERA", qrToken: token });
  }

  async function toggleSound() {
    if (soundEnabled) {
      audio.current?.disable();
      setSoundEnabled(false);
      storeSoundPreference("off");
      return;
    }
    const enabled = await audio.current?.enable();
    setSoundEnabled(Boolean(enabled));
    setAudioUnavailable(!enabled);
    if (enabled) storeSoundPreference("on");
  }

  useEffect(() => {
    if (!hasSoundPreference()) return;
    const unlock = () => {
      void audio.current?.enable().then(enabled => {
        setSoundEnabled(Boolean(enabled));
        setAudioUnavailable(!enabled);
      });
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => () => {
    if (clearFeedbackTimer.current) clearTimeout(clearFeedbackTimer.current);
    void audio.current?.close();
  }, []);

  // `submit` gebruikt alleen stabiele props en refs; opnieuw starten van de camera bij elke render zou scans onderbreken.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void getCsrfToken().catch(() => undefined); if (mode !== "camera" || !video.current) return; let disposed = false; let controls: { stop: () => void } | undefined; const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 1_200 }); setRunning(true); reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video.current, value => { if (value) void submit(value.getText()); }).then(value => { if (disposed) value.stop(); else controls = value; }).catch(() => { if (!disposed) finish({ kind: "error", title: "Camera niet beschikbaar", detail: "Controleer de cameratoestemming en probeer opnieuw." }); }); return () => { disposed = true; controls?.stop(); setRunning(false); }; }, [mode]);

  const iconButton = "grid size-11 shrink-0 place-items-center rounded-full border border-white/20 bg-slate-950/55 text-white shadow-lg backdrop-blur-md transition hover:bg-slate-950/80";

  return <section className="fixed inset-0 z-50 flex h-[100dvh] min-h-0 flex-col overflow-hidden overscroll-none bg-slate-950 text-white sm:relative sm:inset-auto sm:z-auto sm:h-auto sm:min-h-[32rem] sm:rounded-2xl">
    <header className={`absolute inset-x-0 top-0 z-40 flex items-center gap-2 px-3 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-4 ${mode === "manual" ? "bg-white/95 text-slate-900 shadow-sm backdrop-blur" : "bg-gradient-to-b from-black/75 to-transparent"}`}>
      <a href={backHref} className={`${iconButton} ${mode === "manual" ? "border-slate-200 bg-white text-slate-900" : ""}`} aria-label="Terug naar activiteit"><ArrowLeft size={22}/></a>
      <div className="min-w-0 flex-1"><p className={`text-[10px] font-bold uppercase tracking-[.16em] ${mode === "manual" ? "text-[var(--brand-dark)]" : "text-white/65"}`}>Inchecken</p><h1 className="truncate text-sm font-black sm:text-base">{eventName}</h1></div>
      <button type="button" onClick={() => void toggleSound()} className={`${iconButton} ${mode === "manual" ? "border-slate-200 bg-white text-slate-900" : ""}`} aria-label={soundEnabled ? "Geluid uitzetten" : "Geluid aanzetten"} aria-pressed={soundEnabled}>{soundEnabled ? <Volume2 size={20}/> : <VolumeX size={20}/>}</button>
      <button type="button" onClick={() => setMode(mode === "camera" ? "manual" : "camera")} className={`${iconButton} ${mode === "manual" ? "border-slate-200 bg-white text-slate-900" : ""}`} aria-label={mode === "camera" ? "Lid handmatig zoeken" : "Terug naar camera"}>{mode === "camera" ? <Search size={20}/> : <X size={20}/>}</button>
    </header>

    <div className={`relative min-h-0 flex-1 sm:aspect-[4/3] sm:flex-none ${mode === "camera" ? "touch-none" : ""}`}>
      {mode === "camera" ? <>
        <video ref={video} className="absolute inset-0 h-full w-full object-cover" muted playsInline/>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,transparent_34%,rgba(0,0,0,.18)_55%,rgba(0,0,0,.48)_100%)]"/>
        <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(72vw,20rem)] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border-[3px] border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,.12)] sm:w-[min(46%,20rem)]"/>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16 text-center">
          <p className="text-sm font-bold">{running ? "Richt de camera op de QR-code" : "Camera starten…"}</p>
          {!soundEnabled && !audioUnavailable && <p className="mt-1 text-xs text-white/70">Tik bovenaan op geluid voor hoorbare feedback.</p>}
          {audioUnavailable && <p className="mt-1 text-xs text-white/70">Geluid niet beschikbaar · scannen blijft werken.</p>}
        </div>
      </> : <div className="h-full min-h-[100dvh] overflow-y-auto bg-slate-50 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[calc(max(.75rem,env(safe-area-inset-top))+5rem)] text-slate-900 sm:min-h-[32rem] sm:px-6">
        <label className="mb-2 block font-bold">Zoek op naam of lidnummer</label>
        <input autoFocus className="input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Bijvoorbeeld Mila of RT-101"/>
        <div className="mt-3 space-y-2">{members.filter(member => `${member.name} ${member.memberNumber ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 30).map(member => <button type="button" key={member.id} className="flex min-h-16 w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-pink-300 hover:bg-[var(--brand-soft)]" onClick={() => void send({ method: "MANUAL", memberId: member.id })}><span className="min-w-0"><b className="block truncate">{member.name}</b><small className="text-slate-500">{member.memberNumber || "Geen lidnummer"}</small></span><span className="badge badge-brand ml-3">Inchecken</span></button>)}</div>
      </div>}
      <FeedbackOverlay feedback={feedback}/>
      {pendingException && <div className="absolute inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="exception-title" aria-describedby="exception-description">
        <div className="w-full max-w-md rounded-[1.5rem] bg-white p-5 text-slate-900 shadow-2xl sm:p-6">
          <span className="grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700"><TriangleAlert size={26}/></span>
          <h2 id="exception-title" className="mt-4 text-2xl font-black">Dit lid is niet aangemeld</h2>
          <p id="exception-description" className="mt-2 text-sm leading-6 text-slate-600">{pendingException.message} Je kunt de aanwezigheid alleen na expliciete bevestiging als uitzondering registreren.</p>
          <label htmlFor="exception-reason" className="mt-5 block font-bold">Reden voor uitzondering</label>
          <textarea id="exception-reason" autoFocus required rows={3} maxLength={500} className="input mt-2 resize-none" value={exceptionReason} onChange={event => { setExceptionReason(event.target.value); setExceptionReasonError(""); }} aria-invalid={Boolean(exceptionReasonError)} aria-describedby={exceptionReasonError ? "exception-reason-error" : undefined} placeholder="Bijvoorbeeld: mondeling met de organisatie afgestemd"/>
          {exceptionReasonError && <p id="exception-reason-error" className="mt-2 text-sm font-bold text-red-700" role="alert">{exceptionReasonError}</p>}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" className="button button-secondary" onClick={cancelException}>Annuleren</button>
            <button type="button" className="button" onClick={() => void confirmException()}>Toch inchecken</button>
          </div>
        </div>
      </div>}
    </div>
  </section>;
}
