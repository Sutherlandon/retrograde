// @vitest-environment jsdom
// app/components/Header.test.tsx
// The header reflects how the app is hosted without anyone editing code
// (ADR-0017): a self-hosted instance has no marketing site to link to, any
// deployment can brand the header with its own logo, and an SSO deployment
// can hide logout.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { HostingConfig } from "~/server/db_config";

vi.mock("~/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: vi.fn() }),
}));

import Header from "./Header";

const hosted: HostingConfig = { selfHosted: false, hideLogout: false, siteLogo: null };
const user = { id: "user-1", username: "testuser" };

function renderHeader(hosting: HostingConfig, withUser = false) {
  return render(
    <MemoryRouter initialEntries={["/app/dashboard"]}>
      <Header user={withUser ? user : undefined} hosting={hosting} />
    </MemoryRouter>
  );
}

describe("Header — hosting configuration", () => {
  afterEach(() => {
    cleanup();
  });

  it("links to About and Contact on the hosted service", () => {
    renderHeader(hosted);
    expect(screen.getAllByRole("link", { name: "About" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Contact" }).length).toBeGreaterThan(0);
  });

  it("drops the About and Contact links on a self-hosted instance, which has no marketing site", () => {
    renderHeader({ ...hosted, selfHosted: true });
    expect(screen.queryByRole("link", { name: "About" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Contact" })).toBeNull();
  });

  it("shows no deployment logo unless one is configured", () => {
    const { container } = renderHeader(hosted);
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("renders the configured light and dark logos with their alt text", () => {
    const { container } = renderHeader({
      ...hosted,
      siteLogo: { light: "https://cdn.example.com/light.svg", dark: "https://cdn.example.com/dark.svg", alt: "Example Corp" },
    });
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs.map((img) => img.getAttribute("src"))).toEqual([
      "https://cdn.example.com/light.svg",
      "https://cdn.example.com/dark.svg",
    ]);
    expect(imgs.every((img) => img.getAttribute("alt") === "Example Corp")).toBe(true);
  });

  it("offers a signed-in user logout by default", () => {
    renderHeader(hosted, true);
    expect(screen.getAllByText("Logout").length).toBeGreaterThan(0);
  });

  it("offers a signed-in user no logout when the deployment hides it", () => {
    renderHeader({ ...hosted, hideLogout: true }, true);
    expect(screen.queryByText("Logout")).toBeNull();
  });
});
