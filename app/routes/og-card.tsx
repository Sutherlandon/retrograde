// app/routes/og-card.tsx
// Source page for the link-preview image (public/og-image.png): renders the
// 1200×630 card alone, to be captured when the site's look changes. It sits
// outside SiteLayout so no header or footer frames the card, and so carries
// that layout's self-hosted redirect itself (ADR-0017). Kept out of search
// results and the sitemap.
import { redirect } from "react-router";
import { selfHosted } from "~/server/db_config";
import OgCard from "~/components/landing/OgCard";

export const meta = () => [
  { title: "Retrograde – link preview" },
  { name: "robots", content: "noindex, nofollow" },
];

export async function loader() {
  if (selfHosted) return redirect("/app/dashboard");
  return null;
}

export default function OgCardPage() {
  return (
    <main className="min-h-screen bg-night-950 p-8">
      <OgCard />
    </main>
  );
}
