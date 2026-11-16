// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scanner } from "@/components/scanner";
import { SCAN_FEEDBACK_DURATION_MS } from "@/components/scanner-feedback";

vi.mock("@/lib/csrf-client", () => ({ getCsrfToken: vi.fn().mockResolvedValue("csrf-test") }));
vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromConstraints() { return new Promise(() => undefined); }
  },
}));

const members = [{ id: "member-1", name: "Mila de Vries", memberNumber: "RT-101" }];

function response(body: object, ok: boolean) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

function renderUsbScanner() {
  render(<Scanner eventId={42} members={members}/>);
  fireEvent.click(screen.getByRole("tab", { name: "USB" }));
  return screen.getByPlaceholderText("Scannerinvoer…") as HTMLInputElement;
}

function scan(input: HTMLInputElement, token = "qr-token") {
  fireEvent.change(input, { target: { value: token } });
  fireEvent.submit(input.closest("form")!);
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe("scannerfeedback", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("toont een bevestigde lokale check-in als groene succesfeedback", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ member: { name: "Mila de Vries" }, syncStatus: "PENDING" }, true));
    const input = renderUsbScanner();
    scan(input);
    expect(await screen.findByText("Mila ingecheckt!")).toBeTruthy();
    expect(screen.getByText(/Lokaal geregistreerd/)).toBeTruthy();
    expect(navigator.vibrate).toHaveBeenCalledWith(120);
  });

  it("onderscheidt een dubbele check-in met de backendcode", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ code: "ALREADY_CHECKED_IN", message: "Mila de Vries is al ingecheckt om 20:14." }, false));
    const input = renderUsbScanner();
    scan(input);
    expect(await screen.findByText("Mila de Vries is al ingecheckt om 20:14.")).toBeTruthy();
    expect(navigator.vibrate).toHaveBeenCalledWith([80, 70, 80]);
  });

  it("toont een veilige rode fout bij een ongeldige QR-code", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ code: "INVALID_QR", message: "Deze QR-code is ongeldig of verlopen." }, false));
    const input = renderUsbScanner();
    scan(input);
    expect(await screen.findByText("Scan geweigerd")).toBeTruthy();
    expect(screen.getByText("Deze QR-code is ongeldig of verlopen.")).toBeTruthy();
  });

  it("toont een netwerkfout zonder het scanproces te laten crashen", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("offline"));
    const input = renderUsbScanner();
    scan(input);
    expect(await screen.findByText("Verbindingsfout")).toBeTruthy();
    expect(screen.getByText(/Controleer de verbinding/)).toBeTruthy();
  });

  it("blokkeert gelijktijdige scans en accepteert daarna een volgend lid", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(response({ member: { name: "Noah Jansen" }, syncStatus: "PENDING" }, true));
    const input = renderUsbScanner();
    scan(input, "token-mila");
    scan(input, "token-noah");
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFirst(response({ member: { name: "Mila de Vries" }, syncStatus: "PENDING" }, true));
    await flush();
    await act(async () => { vi.advanceTimersByTime(SCAN_FEEDBACK_DURATION_MS); });
    scan(input, "token-noah");
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("blijft scannen wanneer Web Audio niet beschikbaar is", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ member: { name: "Mila" }, syncStatus: "PENDING" }, true));
    const input = renderUsbScanner();
    fireEvent.click(screen.getByRole("button", { name: "Geluid inschakelen" }));
    await flush();
    expect(screen.getByText(/Geluid is niet beschikbaar/)).toBeTruthy();
    scan(input);
    expect(await screen.findByText("Mila ingecheckt!")).toBeTruthy();
  });

  it("verwijdert de overlay automatisch na 1,5 seconde", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(response({ member: { name: "Mila" }, syncStatus: "PENDING" }, true));
    const input = renderUsbScanner();
    scan(input);
    await flush();
    expect(screen.getByText("Mila ingecheckt!")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(SCAN_FEEDBACK_DURATION_MS); });
    expect(screen.queryByText("Mila ingecheckt!")).toBeNull();
  });

  it("stuurt USB-scans met dezelfde feedbackroute naar de check-in-API", async () => {
    vi.mocked(fetch).mockResolvedValue(response({ code: "INVALID_QR", message: "USB-code geweigerd." }, false));
    const input = renderUsbScanner();
    scan(input, "usb-token");
    expect(await screen.findByText("USB-code geweigerd.")).toBeTruthy();
    const request = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ eventId: 42, method: "USB", qrToken: "usb-token" });
  });
});
