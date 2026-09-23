// @vitest-environment jsdom
// app/components/SiteLayout.render.test.tsx
// Every marketing page is drawn on the night sky, so the layout owns that:
// the header goes night, and the night ground runs from the header to the
// footer however short the page is.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createRoutesStub } from "react-router";

vi.mock("~/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "dark", setTheme: vi.fn() }),
}));
vi.mock("~/hooks/useAuth", () => ({ getOptionalUser: vi.fn() }));
vi.mock("~/server/db_config", () => ({ selfHosted: false, hostingConfig: {} }));

import SiteLayout from "./SiteLayout";

afterEach(() => cleanup());

function renderSite() {
  const Stub = createRoutesStub([
    {
      path: "/any-site-page",
      Component: SiteLayout,
      loader: () => ({ user: null, hosting: { selfHosted: false, hideLogout: false, siteLogo: null } }),
      children: [{ index: true, Component: () => <p>A short page</p> }],
    },
  ]);
  return render(<Stub initialEntries={["/any-site-page"]} />);
}

describe("SiteLayout [SITE-002]", () => {
  it("puts the header in its night-sky palette", async () => {
    renderSite();
    expect(await screen.findByRole("banner")).toHaveClass("bg-night-950");
  });

  it("lays the night ground under the whole page, so a short page leaves no gap above the footer", async () => {
    renderSite();
    await screen.findByText("A short page");
    const main = screen.getByRole("main");
    expect(main).toHaveClass("flex-grow", "bg-night-950");
  });
});
