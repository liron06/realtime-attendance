"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import Image from "next/image";

export function MemberQr() {
  const [src, setSrc] = useState("");
  const [left, setLeft] = useState(60);
  const load = useCallback(async () => {
    const response = await fetch("/api/qr", { cache: "no-store" });
    if (response.ok) {
      const body = await response.json();
      setSrc(body.dataUrl);
      setLeft(60);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const refresh = setInterval(load, 60_000);
    const tick = setInterval(() => setLeft(value => value <= 1 ? 60 : value - 1), 1_000);
    return () => { clearTimeout(first); clearInterval(refresh); clearInterval(tick); };
  }, [load]);

  return <div className="text-center">
    <div className="mx-auto aspect-square w-full max-w-80 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_35px_rgba(31,41,55,.08)] ring-8 ring-slate-50">
      {src ? <Image unoptimized width={512} height={512} className="h-full w-full" alt="Jouw persoonlijke RealTime QR-code" src={src}/> : <div className="grid h-full place-items-center text-[var(--brand)]"><RefreshCw className="animate-spin"/><span className="sr-only">QR-code laden</span></div>}
    </div>
    <div className="mx-auto mt-6 max-w-80">
      <div className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-700">Automatisch vernieuwen</span><span aria-live="polite" className="tabular-nums text-slate-500">{left} sec.</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--brand)] transition-[width] duration-1000 ease-linear" style={{ width: `${left / 60 * 100}%` }}/></div>
    </div>
  </div>;
}
