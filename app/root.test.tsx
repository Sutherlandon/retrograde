// app/root.test.tsx
// Vercel Analytics belongs to the hosted service, which runs on Vercel. A
// self-hosted instance must never load its script (ADR-0017): the root loader
// decides, and the root layout renders <Analytics /> only when it allows.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const hosting = vi.hoisted(() => ({ selfHosted: false }));
vi.mock("~/server/db_config", () => ({
  get selfHosted() {
    return hosting.selfHosted;
  },
}));

// Layout reads the root loader's data; the router primitives it renders need a
// data router this test does not build, so they render nothing here.
const rootData = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useRouteLoaderData: () => rootData.value,
    Meta: () => null,
    Links: () => null,
    Scripts: () => null,
    ScrollRestoration: () => null,
  };
});

vi.mock("@vercel/analytics/react", () => ({
  Analytics: () => <script data-testid="vercel-analytics" />,
}));

vi.mock("./components/ThemeInitializer", () => ({ default: () => null }));

import { Layout, loader } from "./root";

function renderLayout() {
  return renderToStaticMarkup(
    <Layout>
      <div />
    </Layout>
  );
}

beforeEach(() => {
  hosting.selfHosted = false;
  rootData.value = undefined;
});

describe("root loader", () => {
  it("loads Vercel Analytics on the hosted service", () => {
    expect(loader()).toEqual({ vercelAnalytics: true });
  });

  it("does not load Vercel Analytics on a self-hosted instance", () => {
    hosting.selfHosted = true;
    expect(loader()).toEqual({ vercelAnalytics: false });
  });
});

describe("root Layout", () => {
  it("renders Vercel Analytics when the root loader allows it", () => {
    rootData.value = { vercelAnalytics: true };
    expect(renderLayout()).toContain('data-testid="vercel-analytics"');
  });

  it("omits Vercel Analytics on a self-hosted instance", () => {
    rootData.value = { vercelAnalytics: false };
    expect(renderLayout()).not.toContain("vercel-analytics");
  });

  it("omits Vercel Analytics when no root data is available", () => {
    expect(renderLayout()).not.toContain("vercel-analytics");
  });
});
