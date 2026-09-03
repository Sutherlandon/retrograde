// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Track session data across mock calls
let sessionData: Record<string, string> = {};

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({
    get: (key: string) => sessionData[key],
    set: (key: string, value: string) => { sessionData[key] = value; },
    unset: (key: string) => { delete sessionData[key]; },
  })),
  commitSession: vi.fn(async () => "session-cookie-value"),
}));

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

// Mutable so SITE-001's loader tests can flip it per-test; `siteConfig`
// resolves it via a getter so the change is visible without re-mocking.
let dashboardHome = false;
vi.mock("~/config/siteConfig", () => ({
  siteConfig: {
    get dashboardHome() {
      return dashboardHome;
    },
    usernameField: "preferred_username",
  },
}));

const mockCreateBoard = vi.fn();
vi.mock("~/server/board_model", () => ({
  createBoard: (...args: unknown[]) => mockCreateBoard(...args),
}));

// Home renders <Form>/<Link> which need a data-router context we don't set
// up here; stub the pieces the component needs while keeping `redirect`
// (used by both the loader and action under test) as the real implementation.
let mockActionData: unknown = undefined;
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode }) =>
      React.createElement("a", { href: to, ...rest }, children),
    Form: ({ children, ...rest }: { children?: React.ReactNode }) =>
      React.createElement("form", { ...rest }, children),
    useActionData: () => mockActionData,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  dashboardHome = false;
  mockActionData = undefined;
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockCreateBoard.mockResolvedValue("new-board-id");
});

function makeFormData(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return form;
}

describe("home page action", () => {
  it("creates board and anonymous user when no session exists [SITE-003]", async () => {
    const { action } = await import("./home");

    // getOrCreateUser will INSERT anonymous user
    const anonId = "anon-uuid-123";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const formData = makeFormData({ title: "My Retro", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} } as never) as unknown as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/board/new-board-id");
    expect(response.headers.get("Set-Cookie")).toBe("session-cookie-value");
    expect(mockCreateBoard).toHaveBeenCalledWith("My Retro");
  });

  it("creates board with existing registered user session", async () => {
    const { action } = await import("./home");

    sessionData["userId"] = "registered-user-1";
    // getOrCreateUser SELECT returns existing user
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "registered-user-1", preferred_username: "realuser" }],
      rowCount: 1,
    });

    const formData = makeFormData({ title: "Team Retro", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} } as never) as unknown as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/board/new-board-id");
    // No Set-Cookie needed for existing user
    expect(response.headers.get("Set-Cookie")).toBeNull();
    // GAP-002: even a registered visitor hitting the trial form gets a
    // crewless, ownerless board — it's claimable, not pre-owned.
    expect(mockCreateBoard).toHaveBeenCalledWith("Team Retro");
  });

  it("returns validation error when title is too short", async () => {
    const { action } = await import("./home");
    const formData = makeFormData({ title: "ab", no_jerks: "on" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} } as never) as unknown as Response;
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.errors.title).toBeDefined();
  });

  it("returns validation error when kindness checkbox not checked", async () => {
    const { action } = await import("./home");
    const formData = makeFormData({ title: "Valid Title" });
    const request = new Request("http://localhost:3000/", {
      method: "POST",
      body: formData,
    });

    const response = await action({ request, params: {}, context: {} } as never) as unknown as Response;
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.errors.no_jerks).toBeDefined();
  });
});

describe("homepage [SITE-001]", () => {
  it("loader renders the homepage (no redirect) when dashboardHome is disabled", async () => {
    const { loader } = await import("./home");
    const result = await loader();
    expect(result).toBeUndefined();
  });

  it("loader redirects to /app/dashboard when dashboardHome is enabled", async () => {
    dashboardHome = true;
    const { loader } = await import("./home");
    const result = (await loader()) as unknown as Response;
    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/app/dashboard");
  });

  it("renders the hero heading, tutorial link, and board-creation form", async () => {
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(
      screen.getByText("Agile Retrospective & Idea Boards for Productive Teams")
    ).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Try the tutorial/i })).toHaveAttribute(
      "href",
      "/app/board/example-board"
    );

    expect(screen.getByText("Create a Free Board")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Launch/i })).toBeInTheDocument();
  });

  it("renders a title validation error from action data", async () => {
    mockActionData = { errors: { title: "Title must be at least 3 characters." } };
    const { default: Home } = await import("./home");
    render(React.createElement(Home));

    expect(screen.getByText("Title must be at least 3 characters.")).toBeInTheDocument();
  });
});
