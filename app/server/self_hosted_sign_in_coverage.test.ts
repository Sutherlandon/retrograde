// app/server/self_hosted_sign_in_coverage.test.ts
// ADR-0021: a self-hosted instance has no guests, and the rule is enforced in
// the identity helpers every route resolves its caller through. This test is
// the tripwire for a route that forgets to: each route module must call one of
// those helpers, or be listed below as public with the reason it is safe.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import routes from "~/routes";

// Each refuses a guest on a self-hosted instance, directly or through getOptionalUser/getApiUser.
const GATED_HELPERS = [
  "requireRegisteredUser",
  "getOptionalUser",
  "getApiUser",
  "getOrCreateUser",
  "requireBoardAccess",
  "requireFacilitator",
];

const PUBLIC_ROUTES: Record<string, string> = {
  "routes/auth/login.ts": "starts sign-in",
  "routes/auth/callback.ts": "completes sign-in",
  "routes/auth/logout.ts": "ends a session",
  "routes/healthcheck.tsx": "load-balancer probe that returns only OK",
  "components/SiteLayout.tsx": "redirects every marketing page to the dashboard when SELF_HOSTED=true",
  "routes/site/about.tsx": "child of SiteLayout",
  "routes/site/contact.tsx": "child of SiteLayout",
  "routes/site/privacy-policy.tsx": "child of SiteLayout",
  "routes/site/terms-of-service.tsx": "child of SiteLayout",
  "routes/sitemap.ts": "returns 404 when SELF_HOSTED=true",
  "routes/og-card.tsx": "redirects to the dashboard when SELF_HOSTED=true",
  "routes/app/board.legacy.tsx": "only redirects to /app/board/:id, which requires sign-in",
  "routes/api/cron.archive-stale.ts": "returns 404 when SELF_HOSTED=true (ADR-0020)",
  "routes/api/stripe.webhook.ts": "returns 404 when SELF_HOSTED=true (ADR-0016)",
};

type RouteEntry = { file: string; children?: RouteEntry[] };

function routeFiles(entries: RouteEntry[]): string[] {
  return entries.flatMap((entry) => [entry.file, ...routeFiles(entry.children ?? [])]);
}

const files = [...new Set(routeFiles(routes as RouteEntry[]))].sort();

describe("self-hosted sign-in coverage (ADR-0021)", () => {
  it.each(files.filter((file) => !(file in PUBLIC_ROUTES)))(
    "%s resolves its caller through a helper that refuses guests",
    (file) => {
      const source = readFileSync(join(process.cwd(), "app", file), "utf8");
      expect(GATED_HELPERS.some((helper) => new RegExp(`\\b${helper}\\(`).test(source))).toBe(true);
    }
  );

  it("lists only routes that exist as public", () => {
    for (const file of Object.keys(PUBLIC_ROUTES)) {
      expect(files).toContain(file);
    }
  });
});
