// app/components/landing/OgCard.tsx
// The 1200×630 image shown when a Retrograde link is shared (og:image). It is
// captured from /og-card rather than drawn by hand, so it stays built from the
// site's own sky, horizon and headline. Content stays centered: some previews
// crop the edges.
import { Logo } from "~/images/icons";
import Horizon from "./Horizon";

// Brighter stars over the tiled starfield, placed clear of the headline.
const STARS = [
  "top-[64px] left-[118px]", "top-[150px] left-[1040px]", "top-[46px] left-[860px]",
  "top-[300px] left-[84px]", "top-[250px] left-[1120px]", "top-[36px] left-[420px]",
];

export default function OgCard() {
  return (
    <div data-testid="og-card" className="night-sky relative h-[630px] w-[1200px] overflow-hidden">
      {STARS.map((pos) => (
        <span
          key={pos}
          aria-hidden="true"
          className={`absolute ${pos} h-1 w-1 rounded-full bg-white shadow-[0_0_8px_2px_rgb(156_192_255/0.6)]`}
        />
      ))}
      <div className="relative z-10 flex flex-col items-center px-12 pt-[112px] text-center">
        <div className="mb-9 flex items-center gap-3 text-white">
          <Logo className="h-14 w-14" />
          <span className="text-[44px] font-bold">Retrograde</span>
        </div>
        {/* One line each; the gradient spans only its own words, as in the hero. */}
        <h1 className="py-0 mb-0 text-[60px] leading-[1.1] font-bold tracking-tight whitespace-nowrap text-white">
          Retros your whole crew shows up for.{" "}
          <br />
          <span className="bg-gradient-to-r from-stardust-100 via-airglow-300 to-starlight-300 bg-clip-text text-transparent">
            People and agents.
          </span>
        </h1>
      </div>
      <Horizon className="absolute inset-x-0 bottom-0 h-[190px]" />
    </div>
  );
}
