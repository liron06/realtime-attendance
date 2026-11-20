// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberQr } from "@/components/member-qr";

vi.mock("next/image", () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={props.src} width={props.width} height={props.height} className={props.className} alt={props.alt ?? ""}/>;
} }));

describe("mobiele leden-QR", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ dataUrl: "data:image/png;base64,qr" }) }));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("houdt de QR binnen de dynamische mobiele viewport en toont de geldigheid", async () => {
    render(<MemberQr/>);
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve(); });
    const frame = screen.getByTestId("member-qr-frame");
    expect(frame.className).toContain("100dvh");
    expect(frame.className).toContain("bg-white");
    expect(screen.getByAltText("Jouw persoonlijke RealTime QR-code")).toBeTruthy();
    expect(screen.getByText("60 sec.")).toBeTruthy();
  });
});
