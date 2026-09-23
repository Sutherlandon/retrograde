// @vitest-environment jsdom
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

describe("/og-card [SITE-007]", () => {
  it("renders on the hosted service", async () => {
    const { loader } = await import("./og-card");
    expect(await loader()).toBeNull();
  });

  it("keeps the source page for the link-preview image out of search results", async () => {
    const { meta } = await import("./og-card");
    expect(meta()).toContainEqual({ name: "robots", content: "noindex, nofollow" });
  });

  // ADR-0017: a self-hosted instance serves no marketing site.
  it("sends a self-hosted instance to the dashboard", async () => {
    hosting.selfHosted = true;
    const { loader } = await import("./og-card");
    const response = (await loader()) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/dashboard");
  });
});
