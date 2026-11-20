export const SCAN_FEEDBACK_DURATION_MS = 1_500;

export type FeedbackKind = "processing" | "success" | "duplicate" | "error";
export type ScanFeedback = {
  kind: FeedbackKind;
  title: string;
  detail?: string;
  note?: string;
};

type CheckInResponse = {
  code?: string;
  message?: string;
  member?: { name?: string };
  syncStatus?: string;
};

export function feedbackFromResponse(response: CheckInResponse, ok: boolean): ScanFeedback {
  if (ok) {
    return {
      kind: "success",
      title: "Ingecheckt!",
      detail: response.member?.name?.trim(),
      note: response.syncStatus === "PENDING"
        ? "Lokaal geregistreerd · synchronisatie met Congressus staat klaar"
        : "Aanwezigheid geregistreerd",
    };
  }

  if (response.code === "ALREADY_CHECKED_IN") {
    return { kind: "duplicate", title: "Al ingecheckt", detail: response.message ?? "Dit lid is al ingecheckt" };
  }

  return {
    kind: "error",
    title: "Scan geweigerd",
    detail: response.message ?? "De QR-code kon niet worden verwerkt. Probeer het opnieuw.",
  };
}

type Cue = Exclude<FeedbackKind, "processing">;
type BrowserWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function createScannerAudio(volume = 0.16) {
  let context: AudioContext | null = null;
  let enabled = false;

  const getConstructor = () => {
    if (typeof window === "undefined") return undefined;
    const browserWindow = window as BrowserWindow;
    return browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
  };

  return {
    isAvailable: () => Boolean(getConstructor()),
    async enable() {
      const AudioContextConstructor = getConstructor();
      if (!AudioContextConstructor) return false;
      try {
        context ??= new AudioContextConstructor();
        await context.resume();
        enabled = context.state === "running";
        return enabled;
      } catch {
        return false;
      }
    },
    disable() {
      enabled = false;
    },
    play(cue: Cue) {
      if (!enabled || !context || context.state !== "running") return;
      try {
        const patterns: Record<Cue, Array<[number, number, number]>> = {
          success: [[660, 0, 0.09], [880, 0.1, 0.12]],
          duplicate: [[440, 0, 0.08], [440, 0.12, 0.08]],
          error: [[330, 0, 0.1], [220, 0.11, 0.15]],
        };
        const start = context.currentTime;
        for (const [frequency, offset, duration] of patterns[cue]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, start + offset);
          gain.gain.setValueAtTime(0.0001, start + offset);
          gain.gain.exponentialRampToValueAtTime(Math.min(Math.max(volume, 0.01), 0.3), start + offset + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(start + offset);
          oscillator.stop(start + offset + duration + 0.01);
        }
      } catch {
        // Audiofeedback is aanvullend en mag het scanproces nooit onderbreken.
      }
    },
    async close() {
      enabled = false;
      try {
        await context?.close();
      } catch {
        // Een al gesloten audiocontext hoeft navigatie niet te blokkeren.
      }
      context = null;
    },
  };
}
