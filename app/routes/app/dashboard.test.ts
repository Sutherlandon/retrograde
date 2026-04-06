import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { usernameField: "preferred_username" },
}));

vi.mock("~/server/board_model", () => ({
  createBoard: vi.fn(),
  duplicateBoardServer: vi.fn(),
  deleteBoardServer: vi.fn(),
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("dashboard loader", () => {
  it("returns boards for registered user", async () => {
    const { loader } = await import("./dashboard");

    sessionData["userId"] = "user-1";
    // requireRegisteredUser SELECT
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "realuser", is_anonymous: false }],
      rowCount: 1,
    });
    // boards query
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "board-1", title: "Sprint Retro", role: "owner" }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/dashboard");
    const result = await loader({ request });

    expect(result).toEqual({
      boards: [{ id: "board-1", title: "Sprint Retro", role: "owner" }],
      sort: "updated",
    });
  });

  it("redirects anonymous user to login", async () => {
    const { loader } = await import("./dashboard");

    sessionData["userId"] = "anon-user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "anon-user-1", preferred_username: "Guest", is_anonymous: true }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/dashboard");

    try {
      await loader({ request });
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
    }
  });

  it("redirects to login when no session exists", async () => {
    const { loader } = await import("./dashboard");

    const request = new Request("http://localhost:3000/app/dashboard");

    try {
      await loader({ request });
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
    }
  });
});
