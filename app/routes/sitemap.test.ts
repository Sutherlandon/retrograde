import { describe, it, expect, vi, beforeEach } from "vitest";
import routes from "~/routes";

const hosting = vi.hoisted(() => ({ selfHosted: false }));
vi.mock("~/server/db_config", () => ({
  get selfHosted() {
    return hosting.selfHosted;
  },
}));

beforeEach(() => {
  hosting.selfHosted = false;
});

async function sitemapBody(): Promise<string> {
  const { loader } = await import("./sitemap");
  const request = new Request("http://localhost:3000/sitemap.xml");
  const response = await loader({ request, params: {}, context: {} } as never);
  return response.text();
}

function urlEntries(body: string): string[] {
  return [...body.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
}

type RouteEntry = { file: string; path?: string; index?: boolean; children?: RouteEntry[] };

// Every page under SiteLayout is a public marketing page, so each belongs in
// the sitemap. A new page added there without a sitemap entry fails this.
function marketingPaths(): string[] {
  const siteLayout = (routes as RouteEntry[]).find((entry) => entry.file === "components/SiteLayout.tsx");
  return (siteLayout?.children ?? []).map((child) => (child.index ? "/" : child.path!));
}

describe("sitemap loader [SITE-005]", () => {
  it("returns XML listing the site pages", async () => {
    const { loader } = await import("./sitemap");
    const request = new Request("http://localhost:3000/sitemap.xml");

    const response = await loader({ request, params: {}, context: {} } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/xml");

    const body = await response.text();
    expect(body).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    expect(body).toContain("<urlset");

    const expectedPaths = [
      "/",
      "/about",
      "/contact",
      "/terms-of-service",
      "/privacy-policy",
      "/app/board/example-board",
    ];
    for (const path of expectedPaths) {
      expect(body).toContain(`<loc>https://retrograde.sh${path}</loc>`);
    }
  });

  it("lists every marketing page under SiteLayout", async () => {
    const body = await sitemapBody();
    const paths = marketingPaths();

    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(body).toContain(`<loc>https://retrograde.sh${path}</loc>`);
    }
  });

  it("gives every URL a lastmod date that is a valid day and not in the future", async () => {
    const entries = urlEntries(await sitemapBody());

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const lastmod = entry.match(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/)?.[1];
      expect(lastmod, entry).toBeDefined();
      const date = new Date(`${lastmod}T00:00:00Z`);
      expect(date.toISOString().slice(0, 10)).toBe(lastmod);
      expect(date.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it("returns 404 on a self-hosted instance, which has no public site to index (ADR-0017)", async () => {
    hosting.selfHosted = true;
    const { loader } = await import("./sitemap");
    const request = new Request("http://localhost:3000/sitemap.xml");

    const response = await loader({ request, params: {}, context: {} } as never);

    expect(response.status).toBe(404);
  });
});
