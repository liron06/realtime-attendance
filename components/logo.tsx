import Image from "next/image";

export function Logo({ href = "/", compactOnMobile = false }: { href?: string; compactOnMobile?: boolean }) {
  return <a href={href} aria-label="S.V. RealTime" className="inline-flex shrink-0 items-center">
    {compactOnMobile && <Image src="/brand/realtime-mark.png" alt="" width={48} height={48} priority className="size-10 object-contain sm:hidden"/>}
    <Image src="/brand/realtime-wordmark.png" alt="S.V. RealTime" width={200} height={33} priority className={`h-auto w-[155px] sm:w-[180px] ${compactOnMobile ? "hidden sm:block" : ""}`}/>
  </a>;
}
