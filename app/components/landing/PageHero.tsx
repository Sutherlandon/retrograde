// app/components/landing/PageHero.tsx
// The night-sky band that opens the marketing site's inner pages (About,
// Contact): the homepage hero's sky and ridge, shorter, around a page title.
import Horizon from "./Horizon";
import SkyFade from "./SkyFade";

export default function PageHero({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <section className="night-sky relative overflow-hidden">
      <SkyFade className="h-32" />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pt-16 pb-36 text-center md:pt-24 md:pb-44">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-airglow-300">{eyebrow}</p>
        <h1 className="py-0 mb-0 text-4xl tracking-tight text-balance text-white md:text-5xl">{title}</h1>
        {lede && <p className="mx-auto mt-5 mb-0 max-w-2xl text-lg text-pretty text-slate-300">{lede}</p>}
      </div>
      <Horizon className="absolute inset-x-0 bottom-0 h-28 md:h-36" />
    </section>
  );
}
