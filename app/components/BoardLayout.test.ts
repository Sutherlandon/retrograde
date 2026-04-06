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

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("BoardLayout loader", () => {
  it("creates anonymous user and sets session cookie when no session exists", async () => {
    const { loader } = await import("./BoardLayout");

    const anonId = "anon-uuid-new";
    // createAnonymousUser INSERT
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const request = new Request("http://localhost:3000/app/board/board-42");
    const response = await loader({ request, params: { id: "board-42" } });

    expect(response).toBeInstanceOf(Response);
    const body = await response.json();
    expect(body.user).toEqual({ id: anonId, username: "Guest" });
    expect(response.headers.get("Set-Cookie")).toBe("session-cookie-value");

    // Verify anonymous user was created with the board's ID
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      expect.arrayContaining(["board-42"]),
    );
  });

  it("returns existing user without setting cookie when session exists", async () => {
    const { loader } = await import("./BoardLayout");

    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "realuser" }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/board/board-42");
    const response = await loader({ request, params: { id: "board-42" } });

    const body = await response.json();
    expect(body.user).toEqual({ id: "user-1", username: "realuser" });
    // No Set-Cookie for existing user
    expect(response.headers.get("Set-Cookie")).toBeNull();
    // Only SELECT, no INSERT
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });

  it("creates new anonymous user when session userId is stale", async () => {
    const { loader } = await import("./BoardLayout");

    sessionData["userId"] = "deleted-user";
    // SELECT returns empty
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // createAnonymousUser INSERT
    const anonId = "anon-uuid-replacement";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const request = new Request("http://localhost:3000/app/board/board-99");
    const response = await loader({ request, params: { id: "board-99" } });

    const body = await response.json();
    expect(body.user).toEqual({ id: anonId, username: "Guest" });
    expect(response.headers.get("Set-Cookie")).toBe("session-cookie-value");
  });

  it("passes the board ID from route params to anonymous user creation", async () => {
    const { loader } = await import("./BoardLayout");

    const anonId = "anon-board-linked";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const request = new Request("http://localhost:3000/app/board/specific-board-id");
    await loader({ request, params: { id: "specific-board-id" } });

    // The INSERT should include the board_id
    const insertCall = mockPoolQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT")
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain("specific-board-id");
  });
});
