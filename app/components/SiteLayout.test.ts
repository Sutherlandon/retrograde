// app/components/SiteLayout.test.ts
// The marketing site exists only on the hosted service. On a self-hosted
// instance the dashboard is home and no site page renders (ADR-0017): the
// SiteLayout loader redirects, and every site page is one of its children, so
// one redirect covers all of them.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetOptionalUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getOptionalUser: (...args: unknown[]) => mockGetOptionalUser(...args),
}));

const hosting = vi.hoisted(() => ({ selfHosted: false }));
vi.mock("~/server/db_config", () => ({
  get selfHosted() {
    return hosting.selfHosted;
  },
  get hostingConfig() {
    return { selfHosted: hosting.selfHosted, hideLogout: false, siteLogo: null };
  },
}));

import { loader } from "./SiteLayout";
import routes from "~/routes";

function load() {
  return loader({ request: new Request("http://localhost/about") } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  hosting.selfHosted = false;
  mockGetOptionalUser.mockResolvedValue(null);
});

describe("SiteLayout loader [SITE-001] [SITE-002]", () => {
  it("renders the marketing site on the hosted service, handing the header its hosting config", async () => {
    expect(await load()).toEqual({
      user: null,
      hosting: { selfHosted: false, hideLogout: false, siteLogo: null },
    });
  });

  it("sends a self-hosted visitor to the dashboard without rendering the site", async () => {
    hosting.selfHosted = true;
    const result = (await load()) as unknown as Response;
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/app/dashboard");
    expect(mockGetOptionalUser).not.toHaveBeenCalled();
  });

  it("is the parent of every site page, so its redirect covers them all", () => {
    const siteLayout = routes.find((r) => r.file === "components/SiteLayout.tsx");
    const childFiles = (siteLayout?.children ?? []).map((c) => c.file).sort();
    expect(childFiles).toEqual([
      "routes/site/about.tsx",
      "routes/site/contact.tsx",
      "routes/site/home.tsx",
      "routes/site/privacy-policy.tsx",
      "routes/site/terms-of-service.tsx",
    ]);
    const stray = routes.filter((r) => r.file.startsWith("routes/site/"));
    expect(stray).toEqual([]);
  });
});
