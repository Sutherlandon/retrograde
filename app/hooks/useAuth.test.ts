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
// The claim used as the username comes from OAUTH_USERNAME_FIELD (ADR-0017);
// mutable so a test can configure a different one.
const auth = vi.hoisted(() => ({ usernameField: "preferred_username", selfHosted: false }));
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
  get oauthUsernameField() {
    return auth.usernameField;
  },
  get selfHosted() {
    return auth.selfHosted;
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
  auth.usernameField = "preferred_username";
  auth.selfHosted = false;
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
      rows: [{ id: "user-1", preferred_username: "testuser", is_anonymous: false }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/board/123");
    const result = await getOptionalUser(request);
    expect(result).toEqual({ id: "user-1", username: "testuser", is_anonymous: false });
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

  it("inserts with a null board_id when boardId is null [BRD-017]", async () => {
    const { createAnonymousUser } = await import("./useAuth");
    const anonId = "anon-uuid-null-board";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const result = await createAnonymousUser(null);

    expect(result).toBe(anonId);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      [expect.stringMatching(/^anon-/), null],
    );
  });
});

describe("getOrCreateUser", () => {
  it("returns existing user when session has valid userId", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "testuser", is_anonymous: false }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/board/board-1");
    const result = await getOrCreateUser(request, "board-1");

    expect(result.user).toEqual({ id: "user-1", username: "testuser", is_anonymous: false });
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

    expect(result.user).toEqual({ id: anonId, username: "Guest", is_anonymous: true });
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

    expect(result.user).toEqual({ id: anonId, username: "Guest", is_anonymous: true });
    expect(result.isNew).toBe(true);
    expect(sessionData["userId"]).toBe(anonId);
  });

  it("uses the configured username claim for existing users", async () => {
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

  it("passes null board_id to the INSERT for an example board id [BRD-017]", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    const anonId = "anon-uuid-example";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const request = new Request("http://localhost:3000/app/board/example-board");
    const result = await getOrCreateUser(request, "example-board");

    expect(result.user).toEqual({ id: anonId, username: "Guest", is_anonymous: true });
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      [expect.stringMatching(/^anon-/), null],
    );
  });

  it("passes null board_id to the INSERT for the real-world example board id [BRD-017]", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    const anonId = "anon-uuid-example-2";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const request = new Request("http://localhost:3000/app/board/example-board-real-world");
    const result = await getOrCreateUser(request, "example-board-real-world");

    expect(result.user).toEqual({ id: anonId, username: "Guest", is_anonymous: true });
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      [expect.stringMatching(/^anon-/), null],
    );
  });

  it("still passes a real board id to the INSERT for a non-example board [BRD-017]", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    const anonId = "anon-uuid-real";
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: anonId }] });

    const request = new Request("http://localhost:3000/app/board/real-board-1");
    const result = await getOrCreateUser(request, "real-board-1");

    expect(result.user).toEqual({ id: anonId, username: "Guest", is_anonymous: true });
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      [expect.stringMatching(/^anon-/), "real-board-1"],
    );
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
    expect(result).toEqual({ id: "cookie-user", username: "alice", is_anonymous: false });
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
    expect(result).toEqual({ id: "user-1", username: "realuser", is_anonymous: false });
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

describe("username claim (ADR-0017)", () => {
  it("takes the username from the claim named by OAUTH_USERNAME_FIELD", async () => {
    auth.usernameField = "email";
    const { getOptionalUser } = await import("./useAuth");
    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "testuser", email: "test@example.com", is_anonymous: false }],
      rowCount: 1,
    });

    const result = await getOptionalUser(new Request("http://localhost:3000/app/board/123"));
    expect(result?.username).toBe("test@example.com");
  });
});

// ADR-0021: a self-hosted instance has no guests. The identity resolvers every
// route goes through refuse anyone without a signed-in account — a redirect to
// sign-in for pages, a 401 for the JSON API — and never create a guest. An
// agent still gets in with an API key a signed-in crew owner minted.
describe("self-hosted instance: no guests (ADR-0021)", () => {
  beforeEach(() => {
    auth.selfHosted = true;
  });

  async function thrown(promise: Promise<unknown>): Promise<Response> {
    try {
      await promise;
    } catch (error) {
      return error as Response;
    }
    throw new Error("expected the call to throw a Response");
  }

  function loginRedirectTarget(response: Response): string | null {
    const location = response.headers.get("Location") ?? "";
    return new URL(location, "http://localhost:3000").searchParams.get("returnTo");
  }

  it("sends a visitor with no session to sign in, returning to the page they asked for", async () => {
    const { getOptionalUser } = await import("./useAuth");
    const response = await thrown(getOptionalUser(new Request("http://localhost:3000/app/board/b1?view=grid")));
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("Location")!, "http://x").pathname).toBe("/auth/login");
    expect(loginRedirectTarget(response)).toBe("/app/board/b1?view=grid");
  });

  it("treats an anonymous session from before the upgrade as signed out", async () => {
    const { getOptionalUser } = await import("./useAuth");
    sessionData["userId"] = "anon-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "anon-1", preferred_username: "Guest", is_anonymous: true }],
      rowCount: 1,
    });
    const response = await thrown(getOptionalUser(new Request("http://localhost:3000/app/board/b1")));
    expect(response.status).toBe(302);
  });

  it("returns a signed-in user", async () => {
    const { getOptionalUser } = await import("./useAuth");
    sessionData["userId"] = "user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", preferred_username: "testuser", is_anonymous: false }],
      rowCount: 1,
    });
    expect(await getOptionalUser(new Request("http://localhost:3000/app/board/b1"))).toEqual({
      id: "user-1",
      username: "testuser",
      is_anonymous: false,
    });
  });

  it("returns a background data request to its page after sign-in, not to the .data URL", async () => {
    const { getOptionalUser } = await import("./useAuth");
    const response = await thrown(
      getOptionalUser(new Request("http://localhost:3000/app/board/b1.data?_routes=routes%2Fapp%2Fboard"))
    );
    expect(loginRedirectTarget(response)).toBe("/app/board/b1");
  });

  it("returns to the dashboard instead of a marketing page, which a self-hosted instance does not serve", async () => {
    const { getOptionalUser } = await import("./useAuth");
    for (const url of ["http://localhost:3000/", "http://localhost:3000/_root.data", "http://localhost:3000/about"]) {
      expect(loginRedirectTarget(await thrown(getOptionalUser(new Request(url))))).toBe("/app/dashboard");
    }
  });

  it("answers the JSON API with 401 rather than a redirect", async () => {
    const { getApiUser } = await import("./useAuth");
    const response = await thrown(getApiUser(new Request("http://localhost:3000/api/v1/boards", { method: "POST" })));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("still lets an agent in with an API key", async () => {
    const { getApiUser } = await import("./useAuth");
    mockFindApiKeyByValue.mockResolvedValueOnce({ id: "key-1", team_id: "team-1", agent_user_id: "agent-1" });
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "agent-1", display_name: "Claude", is_anonymous: true, is_agent: true }],
      rowCount: 1,
    });
    const request = new Request("http://localhost:3000/api/v1/boards", {
      method: "POST",
      headers: { Authorization: "Bearer rk_live_valid" },
    });
    expect(await getApiUser(request)).toEqual({ id: "agent-1", username: "Claude", teamId: "team-1" });
  });

  it("refuses an API key that does not resolve", async () => {
    const { getApiUser } = await import("./useAuth");
    mockFindApiKeyByValue.mockResolvedValueOnce(null);
    const request = new Request("http://localhost:3000/api/v1/boards/b1", {
      headers: { Authorization: "Bearer rk_live_revoked" },
    });
    expect((await thrown(getApiUser(request))).status).toBe(401);
  });

  it("refuses a legacy agent_token, which belongs to an anonymous agent", async () => {
    const { getApiUser } = await import("./useAuth");
    sessionData["userId"] = "agent-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "agent-1", display_name: "Agent", is_anonymous: true, is_agent: true }],
      rowCount: 1,
    });
    const request = new Request("http://localhost:3000/api/v1/boards/b1/notes", {
      method: "POST",
      headers: { Authorization: "Bearer legacy-session-token" },
    });
    expect((await thrown(getApiUser(request))).status).toBe(401);
  });

  it("never creates a guest for a board visit [AUTH-004]", async () => {
    const { getOrCreateUser } = await import("./useAuth");
    const response = await thrown(getOrCreateUser(new Request("http://localhost:3000/app/board/b1"), "b1"));
    expect(response.status).toBe(302);
    const inserts = mockPoolQuery.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO users"));
    expect(inserts).toHaveLength(0);
  });
});
