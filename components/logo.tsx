import Image from "next/image";

export function Logo({ href = "/" }: { href?: string }) {
  return <a href={href} aria-label="S.V. RealTime" className="inline-flex shrink-0 items-center">
    <Image src="/brand/realtime-wordmark.png" alt="S.V. RealTime" width={200} height={33} priority className="h-auto w-[155px] sm:w-[180px]"/>
  </a>;
}
