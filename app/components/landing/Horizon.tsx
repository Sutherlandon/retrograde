// app/components/landing/Horizon.tsx
// Silhouetted treeline and mountain ridge that the marketing site's night-sky
// sections sit on. Purely decorative: hidden from assistive technology.
import { useId } from "react";

export default function Horizon({ className = "" }: { className?: string }) {
  // Each instance needs its own gradient id; the page renders more than one.
  const rimId = `horizon-rim-${useId()}`;
  return (
    <svg
      data-testid="horizon"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 320"
      preserveAspectRatio="none"
      className={`pointer-events-none block w-full ${className}`}
    >
      <defs>
        <linearGradient id={rimId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--color-airglow-300)" stopOpacity="0" />
          <stop offset="0.45" stopColor="var(--color-airglow-300)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--color-starlight-300)" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {/* Far ridge, lit faintly by the airglow behind it */}
      <path
        d="M0 300 C 320 290 560 262 780 214 C 980 170 1150 118 1300 92 C 1360 82 1410 80 1440 82 L1440 320 L0 320 Z"
        className="fill-night-700"
      />
      {/* Rim light where the airglow catches the far ridge */}
      <path
        d="M0 300 C 320 290 560 262 780 214 C 980 170 1150 118 1300 92 C 1360 82 1410 80 1440 82"
        fill="none"
        stroke={`url(#${rimId})`}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      {/* Near ridge and the treeline on the left */}
      <path
        d="M0 320 L0 196 L14 188 L22 204 L34 166 L44 190 L58 150 L70 184 L84 140 L96 176 L108 162 L118 194 L134 170 L146 204 L164 186 L178 214 L204 208 L226 232 L262 238 L300 262 C 520 268 700 256 880 226 C 1040 198 1190 160 1320 134 C 1380 122 1420 118 1440 118 L1440 320 Z"
        className="fill-night-950"
      />
    </svg>
  );
}
