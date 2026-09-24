import { describe, it, expect, vi, beforeEach } from "vitest";

const hosting = vi.hoisted(() => ({ selfHosted: false }));
vi.mock("~/server/db_config", () => ({
  get selfHosted() {
    return hosting.selfHosted;
  },
}));

beforeEach(() => {
  hosting.selfHosted = false;
});

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

  it("returns 404 on a self-hosted instance, which has no public site to index (ADR-0017)", async () => {
    hosting.selfHosted = true;
    const { loader } = await import("./sitemap");
    const request = new Request("http://localhost:3000/sitemap.xml");

    const response = await loader({ request, params: {}, context: {} } as never);

    expect(response.status).toBe(404);
  });
});
