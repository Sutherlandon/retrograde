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
  siteConfig: {
    usernameField: "preferred_username",
  },
}));

const mockFindApiKeyByValue = vi.fn();
const mockTouchApiKeyLastUsed = vi.fn();
vi.mock("~/server/api_key", () => ({
  isApiKey: (t: string) => typeof t === "string" && t.startsWith("rk_live_"),
  findApiKeyByValue: (...args: unknown[]) => mockFindApiKeyByValue(...args),
  touchApiKeyLastUsed: (...args: unknown[]) => mockTouchApiKeyLastUsed(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockTouchApiKeyLastUsed.mockResolvedValue(undefined);
});

describe("getOptionalUser", () => {
  it("returns null when no userId in session", async () => {
    const { getOptionalUser } = await import("./useAuth");
    const request = new Request("http://localhost:3000/app/board/123");

    const result = await getOptionalUser(request);
    expect(result).toBeNull();
  });

  it("returns null when userId in session but user not in DB", async () => {
    const { getOptionalUser } = await import("./useAuth");
    sessionData["userId"] = "non-existent-id";
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const request = new Request("http://localhost:3000/app/board/123");
    const result = await getOptionalUser(request);
    expect(result).toBeNull();
  });

  it("returns user when session has valid userId", async () => {
    const { getOptionalUser } = await import("./useAuth");
    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "testuser" }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/board/123");
    const result = await getOptionalUser(request);
    expect(result).toEqual({ id: "user-1", username: "testuser" });
  });
});

describe("createAnonymousUser", () => {
  it("inserts an anonymous user with board_id and returns the user id", async () => {
    const { createAnonymousUser } = await import("./useAuth");
    const anonId = "anon-uuid-123";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const result = await createAnonymousUser("board-1");

    expect(result).toBe(anonId);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      [expect.stringMatching(/^anon-/), "board-1"],
    );
  });
});

describe("getOrCreateUser", () => {
  it("returns existing user when session has valid userId", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "testuser" }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/board/board-1");
    const result = await getOrCreateUser(request, "board-1");

    expect(result.user).toEqual({ id: "user-1", username: "testuser" });
    expect(result.isNew).toBe(false);
    // Should only have queried for the user, not inserted
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery.mock.calls[0][0]).toContain("SELECT");
  });

  it("creates anonymous user when no session exists", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    const anonId = "anon-uuid-456";
    // createAnonymousUser INSERT
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const request = new Request("http://localhost:3000/app/board/board-1");
    const result = await getOrCreateUser(request, "board-1");

    expect(result.user).toEqual({ id: anonId, username: "Guest" });
    expect(result.isNew).toBe(true);
    expect(sessionData["userId"]).toBe(anonId);
    // Verify INSERT was called with board_id
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      expect.arrayContaining(["board-1"]),
    );
  });

  it("creates anonymous user when session userId points to deleted user", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    sessionData["userId"] = "deleted-user-id";
    // SELECT returns empty (user was deleted)
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // createAnonymousUser INSERT
    const anonId = "anon-uuid-789";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const request = new Request("http://localhost:3000/app/board/board-2");
    const result = await getOrCreateUser(request, "board-2");

    expect(result.user).toEqual({ id: anonId, username: "Guest" });
    expect(result.isNew).toBe(true);
    expect(sessionData["userId"]).toBe(anonId);
  });

  it("uses siteConfig.usernameField for existing users", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "custom_name" }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/board/board-1");
    const result = await getOrCreateUser(request, "board-1");

    expect(result.user.username).toBe("custom_name");
  });

  it("falls back to 'Guest' when usernameField is missing on existing user", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1" }], // no preferred_username
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/board/board-1");
    const result = await getOrCreateUser(request, "board-1");

    expect(result.user.username).toBe("Guest");
  });
});

describe("getApiUser", () => {
  it("resolves an rk_live_ token to the agent user with teamId", async () => {
    const { getApiUser } = await import("./useAuth");
    mockFindApiKeyByValue.mockResolvedValueOnce({
      id: "key-1",
      team_id: "team-1",
      agent_user_id: "agent-1",
    });
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "agent-1", display_name: "Claude", preferred_username: "Agent" }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/api/v1/boards", {
      headers: { Authorization: "Bearer rk_live_validkey" },
    });
    const result = await getApiUser(request);

    expect(result).toEqual({
      id: "agent-1",
      username: "Claude",
      teamId: "team-1",
    });
    expect(mockFindApiKeyByValue).toHaveBeenCalledWith("rk_live_validkey");
    expect(mockTouchApiKeyLastUsed).toHaveBeenCalledWith("key-1");
  });

  it("returns null for an rk_live_ token that does not resolve (no fall-through to cookie)", async () => {
    const { getApiUser } = await import("./useAuth");
    mockFindApiKeyByValue.mockResolvedValueOnce(null);
    sessionData["userId"] = "should-not-be-used";

    const request = new Request("http://localhost:3000/api/v1/boards", {
      headers: { Authorization: "Bearer rk_live_revokedkey" },
    });
    const result = await getApiUser(request);

    expect(result).toBeNull();
  });

  it("falls back to cookie auth when no Authorization header is present", async () => {
    const { getApiUser } = await import("./useAuth");
    sessionData["userId"] = "cookie-user";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "cookie-user", preferred_username: "alice" }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/api/v1/boards");
    const result = await getApiUser(request);
    expect(result).toEqual({ id: "cookie-user", username: "alice" });
  });

  it("legacy bearer (non-rk_live_) still resolves via session-cookie path", async () => {
    const { getApiUser } = await import("./useAuth");
    // Pre-seed session so the bearer-as-cookie parse finds a userId
    sessionData["userId"] = "legacy-user";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "legacy-user", preferred_username: "legacy", display_name: null }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/api/v1/boards", {
      headers: { Authorization: "Bearer some-old-session-token" },
    });
    const result = await getApiUser(request);
    expect(result).toEqual({ id: "legacy-user", username: "legacy" });
    expect(mockFindApiKeyByValue).not.toHaveBeenCalled();
  });
});

describe("requireRegisteredUser", () => {
  it("returns user when session has a registered (non-anonymous) user", async () => {
    const { requireRegisteredUser } = await import("./useAuth");
    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "realuser", is_anonymous: false }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/dashboard");
    const result = await requireRegisteredUser(request);
    expect(result).toEqual({ id: "user-1", username: "realuser" });
  });

  it("redirects to login when no session exists", async () => {
    const { requireRegisteredUser } = await import("./useAuth");
    const request = new Request("http://localhost:3000/app/dashboard");

    try {
      await requireRegisteredUser(request);
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
      expect(res.headers.get("Location")).toContain("returnTo=%2Fapp%2Fdashboard");
    }
  });

  it("redirects to login when user is anonymous", async () => {
    const { requireRegisteredUser } = await import("./useAuth");
    sessionData["userId"] = "anon-user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "anon-user-1", preferred_username: "Guest", is_anonymous: true }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/dashboard");

    try {
      await requireRegisteredUser(request);
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
    }
  });

  it("redirects to login when userId in session but user not found in DB", async () => {
    const { requireRegisteredUser } = await import("./useAuth");
    sessionData["userId"] = "deleted-user";
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const request = new Request("http://localhost:3000/app/dashboard");

    try {
      await requireRegisteredUser(request);
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
    }
  });
});
