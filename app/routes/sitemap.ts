// app/routes/sitemap.ts
// The sitemap search engines read for the hosted site (SITE-005).
import type { LoaderFunctionArgs } from "react-router";
import { selfHosted } from "~/server/db_config";

const baseUrl = "https://retrograde.sh";

// lastmod is the date the page's content last changed meaningfully — copy,
// links, what the page shows. Search engines use it to decide what to recrawl,
// and stop trusting it if it moves without the page changing, so bump a date
// when you change that page and never set them all to the deploy time.
// (changefreq and priority are omitted: Google ignores both.)
const pages = [
  { path: "/", lastmod: "2026-09-23" },
  { path: "/about", lastmod: "2026-09-23" },
  { path: "/contact", lastmod: "2026-09-23" },
  { path: "/terms-of-service", lastmod: "2026-01-01" },
  { path: "/privacy-policy", lastmod: "2026-01-01" },
  { path: "/app/board/example-board", lastmod: "2026-09-23" },
];

export async function loader(_args: LoaderFunctionArgs) {
  // A self-hosted instance has no public site to index (ADR-0017).
  if (selfHosted) return new Response("Not Found", { status: 404 });

  const urls = pages
    .map((page) => `  <url>\n    <loc>${baseUrl}${page.path}</loc>\n    <lastmod>${page.lastmod}</lastmod>\n  </url>`)
    .join("\n");

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
