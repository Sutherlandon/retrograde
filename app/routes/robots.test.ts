// app/routes/robots.test.ts
// The crawl policy: open on the production host, closed everywhere else.
import { describe, it, expect, vi } from "vitest";

vi.mock("~/server/db_config", () => ({ selfHosted: false }));

async function robotsFor(url: string): Promise<Response> {
  const { loader } = await import("./robots");
  return loader({ request: new Request(url), params: {}, context: {} } as never);
}

// Google's precedence: the longest matching Allow/Disallow prefix wins, and
// Allow wins a tie. No match means allowed.
function isAllowed(robots: string, path: string): boolean {
  let best = { length: -1, allow: true };
  for (const line of robots.split("\n")) {
    const rule = line.match(/^(Allow|Disallow):\s*(\S*)\s*$/);
    if (!rule || !rule[2] || !path.startsWith(rule[2])) continue;
    const allow = rule[1] === "Allow";
    if (rule[2].length > best.length || (rule[2].length === best.length && allow)) {
      best = { length: rule[2].length, allow };
    }
  }
  return best.allow;
}

describe("robots.txt loader [SITE-008]", () => {
  it("serves plain text that points crawlers at the sitemap on retrograde.sh", async () => {
    const response = await robotsFor("https://retrograde.sh/robots.txt");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("User-agent: *");
    expect(body).toContain("Sitemap: https://retrograde.sh/sitemap.xml");
  });

  it("keeps crawlers out of boards, the API and sign-in on retrograde.sh", async () => {
    const body = await (await robotsFor("https://retrograde.sh/robots.txt")).text();

    for (const path of ["/app/dashboard", "/app/board/abc123", "/board/abc123", "/api/v1/boards", "/auth/login"]) {
      expect(isAllowed(body, path), path).toBe(false);
    }
  });

  it("allows every URL the sitemap lists", async () => {
    const body = await (await robotsFor("https://retrograde.sh/robots.txt")).text();
    const { loader } = await import("./sitemap");
    const sitemap = await (await loader({
      request: new Request("https://retrograde.sh/sitemap.xml"),
      params: {},
      context: {},
    } as never)).text();

    const paths = [...sitemap.matchAll(/<loc>https:\/\/retrograde\.sh([^<]*)<\/loc>/g)].map((match) => match[1]);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(isAllowed(body, path), path).toBe(true);
    }
  });

  it.each([
    ["staging", "https://staging.retrograde.sh/robots.txt"],
    ["a Vercel preview", "https://retrograde-git-branch-team.vercel.app/robots.txt"],
    ["local dev", "http://localhost:3000/robots.txt"],
    ["a self-hosted instance", "https://retro.example.com/robots.txt"],
  ])("disallows everything on %s, so only production is indexed", async (_label, url) => {
    const body = await (await robotsFor(url)).text();

    expect(isAllowed(body, "/")).toBe(false);
    expect(isAllowed(body, "/about")).toBe(false);
    expect(body).not.toContain("Sitemap:");
  });
});
