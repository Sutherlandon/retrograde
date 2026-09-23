// app/components/landing/SkyFade.tsx
// Darkness at the top of a night-sky section, clearing to open sky, so the
// section meets the solid band above it without a hard edge — like eyes
// adjusting to the dark. Purely decorative.
export default function SkyFade({ className }: { className: string }) {
  return (
    <div
      data-testid="sky-fade"
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-night-950 to-transparent ${className}`}
    />
  );
}
