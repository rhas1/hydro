import { useId } from "react";

import { cx } from "./ui";

/** The Hydro droplet. Same artwork as public/favicon.svg. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#5fe3ff" />
          <stop offset="1" stopColor="#0077b6" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d="M32 4C32 4 12 26.5 12 40.5a20 20 0 0 0 40 0C52 26.5 32 4 32 4Z" />
        </clipPath>
      </defs>
      <path d="M32 4C32 4 12 26.5 12 40.5a20 20 0 0 0 40 0C52 26.5 32 4 32 4Z" fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`}>
        <path d="M6 41c4.5 0 7-4 13-4s8.5 4 13 4 7-4 13-4 8.5 4 13 4v26H6Z" fill="#0a2540" opacity="0.28" />
        <path d="M6 48c4.5 0 7-3.5 13-3.5s8.5 3.5 13 3.5 7-3.5 13-3.5 8.5 3.5 13 3.5v20H6Z" fill="#0a2540" opacity="0.22" />
      </g>
      <path d="M23.5 31c-2.6 3.6-4 7-4.2 10.2" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-8" />
      <span className={cx("text-xl font-extrabold tracking-tight", light ? "text-white" : "text-abyss-900")}>
        Hydro
      </span>
    </span>
  );
}

/** Two drifting wave layers, used as decoration on dark surfaces. */
export function Waves({ className }: { className?: string }) {
  const wave = "M0 30 C 150 60 350 0 500 30 C 650 60 850 0 1000 30 V 80 H 0 Z";
  return (
    <div className={cx("pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden", className)} aria-hidden="true">
      <svg viewBox="0 0 2000 80" preserveAspectRatio="none" className="h-full w-[200%] animate-drift opacity-40 motion-reduce:animate-none">
        <path d={wave} fill="#00b8f0" fillOpacity="0.25" />
        <path d={wave} transform="translate(1000 0)" fill="#00b8f0" fillOpacity="0.25" />
      </svg>
      <svg
        viewBox="0 0 2000 80"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-[200%] animate-drift opacity-60 [animation-direction:reverse] [animation-duration:22s] motion-reduce:animate-none"
      >
        <path d={wave} transform="translate(0 12)" fill="#0094cc" fillOpacity="0.3" />
        <path d={wave} transform="translate(1000 12)" fill="#0094cc" fillOpacity="0.3" />
      </svg>
    </div>
  );
}
