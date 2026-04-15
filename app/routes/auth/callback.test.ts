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

const mockQuery = vi.fn();
const mockRelease = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    connect: vi.fn(async () => ({
      query: mockQuery,
      release: mockRelease,
    })),
  },
  oauthRedirectUri: "http://localhost:3000/auth/callback",
}));

// Mock global fetch for token and profile requests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeState(returnTo: string | null = "/app/dashboard") {
  return Buffer.from(JSON.stringify({ returnTo, nonce: "test-nonce" })).toString("base64url");
}

function setupFetchMocks() {
  mockFetch
    .mockResolvedValueOnce({
      json: async () => ({ access_token: "test-access-token" }),
    })
    .mockResolvedValueOnce({
      json: async () => ({
        sub: "ext-123",
        email: "test@example.com",
        name: "Test User",
        preferred_username: "testuser",
        given_name: "Test",
        family_name: "User",
        email_verified: true,
      }),
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};

  process.env.OAUTH_TOKEN_URL = "https://auth.example.com/token";
  process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
  process.env.OAUTH_CLIENT_ID = "test-client-id";
  process.env.OAUTH_CLIENT_SECRET = "test-client-secret";
  process.env.OAUTH_USERINFO_URL = "https://auth.example.com/userinfo";
  process.env.SESSION_SECRET = "test-secret";

  mockQuery.mockResolvedValue({ rows: [{ id: 42 }] });
});

describe("GET /auth/callback", () => {
  it("returns 400 when code is missing", async () => {
    const { loader } = await import("./callback");
    const state = makeState();
    const request = new Request(`http://localhost:3000/auth/callback?state=${state}`);

    try {
      await loader({ request });
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Missing code or state");
    }
  });

  it("returns 400 when state is missing", async () => {
    const { loader } = await import("./callback");
    const request = new Request("http://localhost:3000/auth/callback?code=test-code");

    try {
      await loader({ request });
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Missing code or state");
    }
  });

  it("redirects to / when session state is already cleared (duplicate callback)", async () => {
    const { loader } = await import("./callback");
    const state = makeState();
    // Don't set oauth_state in session — simulates already-completed OAuth
    const request = new Request(`http://localhost:3000/auth/callback?code=test-code&state=${state}`);

    const res = await loader({ request }) as unknown as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("returns 400 when state does not match session", async () => {
    const { loader } = await import("./callback");
    const state = makeState();
    sessionData["oauth_state"] = "different-state";
    const request = new Request(`http://localhost:3000/auth/callback?code=test-code&state=${state}`);

    try {
      await loader({ request });
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Invalid OAuth state");
    }
  });

  it("exchanges code for token and upserts user on success", async () => {
    setupFetchMocks();
    const { loader } = await import("./callback");
    const state = makeState("/app/dashboard");
    sessionData["oauth_state"] = state;
    const request = new Request(`http://localhost:3000/auth/callback?code=test-code&state=${state}`);

    const res = await loader({ request }) as unknown as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/app/dashboard");
    expect(res.headers.get("Set-Cookie")).toBe("session-cookie-value");

    // Verify token exchange
    expect(mockFetch).toHaveBeenCalledWith(
      "https://auth.example.com/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }),
    );

    // Verify user profile fetch
    expect(mockFetch).toHaveBeenCalledWith(
      "https://auth.example.com/userinfo",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-access-token" },
      }),
    );

    // Verify DB upsert was called
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      ["ext-123", "test@example.com", "Test User", "testuser", "Test", "User", true],
    );

    // Verify session was updated with user ID
    expect(sessionData["userId"]).toBe(42);

    // Verify DB client was released
    expect(mockRelease).toHaveBeenCalled();
  });

  it("redirects to /app/dashboard when returnTo is null", async () => {
    setupFetchMocks();
    const { loader } = await import("./callback");
    const state = makeState(null);
    sessionData["oauth_state"] = state;
    const request = new Request(`http://localhost:3000/auth/callback?code=test-code&state=${state}`);

    const res = await loader({ request }) as unknown as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/app/dashboard");
  });

  it("releases the DB client even when the query fails", async () => {
    setupFetchMocks();
    const { loader } = await import("./callback");
    const state = makeState();
    sessionData["oauth_state"] = state;
    mockQuery.mockRejectedValueOnce(new Error("DB error"));

    const request = new Request(`http://localhost:3000/auth/callback?code=test-code&state=${state}`);

    await expect(loader({ request })).rejects.toThrow("DB error");
    expect(mockRelease).toHaveBeenCalled();
  });
});
