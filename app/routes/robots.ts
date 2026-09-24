// app/routes/robots.ts
// robots.txt (SITE-008). Only the production host is open to crawlers: staging
// is public on its own domain, and previews, local dev and self-hosted
// instances have nothing to index, so every other host disallows everything.
import type { LoaderFunctionArgs } from "react-router";

const productionHost = "retrograde.sh";

// Boards are private by obscurity of their id, so /app/ stays closed except
// the example board the sitemap lists. /board/ is the legacy redirect to /app/board/.
const productionRobots = `User-agent: *
Allow: /app/board/example-board
Disallow: /app/
Disallow: /board/
Disallow: /api/
Disallow: /auth/

Sitemap: https://${productionHost}/sitemap.xml
`;

const closedRobots = `User-agent: *
Disallow: /
`;

export async function loader({ request }: LoaderFunctionArgs) {
  const isProduction = new URL(request.url).hostname === productionHost;

  return new Response(isProduction ? productionRobots : closedRobots, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
