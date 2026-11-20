// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scanner } from "@/components/scanner";
import { SCAN_FEEDBACK_DURATION_MS } from "@/components/scanner-feedback";

const zxing = vi.hoisted(() => ({ callback: undefined as ((result?: { getText(): string }) => void) | undefined, rejectCamera: false, stop: vi.fn() }));
vi.mock("@/lib/csrf-client", () => ({ getCsrfToken: vi.fn().mockResolvedValue("csrf-test") }));
vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromConstraints(_constraints: unknown, _video: unknown, callback: (result?: { getText(): string }) => void) {
      zxing.callback = callback;
      return zxing.rejectCamera ? Promise.reject(new Error("permission denied")) : Promise.resolve({ stop: zxing.stop });
    }
  },
}));

const members = [{ id: "member-1", name: "Mila de Vries", memberNumber: "RT-101" }];

function response(body: object, ok: boolean) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}
function renderScanner() {
  return render(<Scanner eventId={42} eventName="LAN-party" backHref="/bestuur/activiteiten/42" members={members}/>);
}
async function scanCamera(token = "qr-token") {
  await act(async () => { zxing.callback?.({ getText: () => token }); await Promise.resolve(); });
}
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("scannerfeedback", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      key: () => null,
      get length() { return values.size; },
    } satisfies Storage });
    zxing.callback = undefined;
    zxing.rejectCamera = false;
    zxing.stop.mockClear();
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vi.fn() });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("toont een bevestigde lokale camera-check-in als succesfeedback", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ member: { name: "Mila de Vries" }, syncStatus: "PENDING" }, true));
    renderScanner();
    await flush();
    await scanCamera();
    expect(await screen.findByText("Ingecheckt!")).toBeTruthy();
    expect(screen.getByText("Mila de Vries")).toBeTruthy();
    expect(screen.getByText(/Lokaal geregistreerd/)).toBeTruthy();
  });

  it("onderscheidt een dubbele scan met naam en oorspronkelijke tijd", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ code: "ALREADY_CHECKED_IN", message: "Mila de Vries is al ingecheckt om 20:14." }, false));
    renderScanner();
    await flush();
    await scanCamera();
    expect(await screen.findByText("Al ingecheckt")).toBeTruthy();
    expect(screen.getByText("Mila de Vries is al ingecheckt om 20:14.")).toBeTruthy();
    expect(navigator.vibrate).toHaveBeenCalledWith([80, 70, 80]);
  });

  it("toont een veilige fout bij een ongeldige QR-code", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ code: "INVALID_QR", message: "Deze QR-code is ongeldig of verlopen." }, false));
    renderScanner();
    await flush();
    await scanCamera();
    expect(await screen.findByText("Scan geweigerd")).toBeTruthy();
    expect(screen.getByText("Deze QR-code is ongeldig of verlopen.")).toBeTruthy();
  });

  it("blokkeert gelijktijdige scans en accepteert daarna een ander lid", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce(response({ member: { name: "Noah Jansen" }, syncStatus: "PENDING" }, true));
    renderScanner();
    await flush();
    await scanCamera("token-mila");
    await scanCamera("token-noah");
    expect(fetch).toHaveBeenCalledTimes(1);
    resolveFirst(response({ member: { name: "Mila de Vries" }, syncStatus: "PENDING" }, true));
    await flush();
    await act(async () => { vi.advanceTimersByTime(SCAN_FEEDBACK_DURATION_MS); });
    await scanCamera("token-mila");
    expect(fetch).toHaveBeenCalledTimes(1);
    await scanCamera("token-noah");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("valt zonder Web Audio veilig terug", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ member: { name: "Mila" }, syncStatus: "PENDING" }, true));
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Geluid aanzetten" }));
    await flush();
    expect(screen.getByText(/Geluid niet beschikbaar/)).toBeTruthy();
    await scanCamera();
    expect(await screen.findByText("Ingecheckt!")).toBeTruthy();
  });

  it("verwijdert de overlay automatisch na 1,5 seconde", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(response({ member: { name: "Mila" }, syncStatus: "PENDING" }, true));
    renderScanner();
    await flush();
    await scanCamera();
    expect(screen.getByText("Ingecheckt!")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(SCAN_FEEDBACK_DURATION_MS); });
    expect(screen.queryByText("Ingecheckt!")).toBeNull();
  });

  it("biedt alleen Camera en Zoeken en gebruikt handmatig zoeken als fallback", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ member: { name: "Mila de Vries" }, syncStatus: "PENDING" }, true));
    renderScanner();
    expect(screen.queryByText("USB")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lid handmatig zoeken" }));
    fireEvent.change(screen.getByPlaceholderText("Bijvoorbeeld Mila of RT-101"), { target: { value: "RT-101" } });
    fireEvent.click(screen.getByRole("button", { name: /Mila de Vries/ }));
    expect(await screen.findByText("Ingecheckt!")).toBeTruthy();
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ eventId: 42, method: "MANUAL", memberId: "member-1" });
  });

  it("toont cameratoestemmingsfouten en stopt cameraresources bij navigatie", async () => {
    zxing.rejectCamera = true;
    const denied = renderScanner();
    expect(await screen.findByText("Camera niet beschikbaar")).toBeTruthy();
    denied.unmount();
    zxing.rejectCamera = false;
    const active = renderScanner();
    await flush();
    active.unmount();
    expect(zxing.stop).toHaveBeenCalled();
  });
});
