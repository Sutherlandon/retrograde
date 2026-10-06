import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRecordGrowthEvent = vi.fn();
vi.mock("~/server/growth_model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/growth_model")>()),
  recordGrowthEvent: (...args: unknown[]) => mockRecordGrowthEvent(...args),
}));

// The visitor's existing session, if any (a guest's userId).
const seed = vi.hoisted(() => ({ userId: undefined as string | undefined }));

// OAuth settings are read and validated once in db_config.ts (CLAUDE.md rule 5).
vi.mock("~/server/db_config", () => ({
  oauthRedirectUri: "http://localhost:3000/auth/callback",
  oauthClientId: "test-client-id",
  oauthScopes: "openid profile email",
  oauthAuthorizationUrl: "https://auth.example.com/authorize",
}));

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => {
    const data: Record<string, string> = seed.userId ? { userId: seed.userId } : {};
    return {
      get: (key: string) => data[key],
      set: (key: string, value: string) => { data[key] = value; },
      unset: (key: string) => { delete data[key]; },
      data,
    };
  }),
  commitSession: vi.fn(async () => "session-cookie-value"),
}));

describe("GET /auth/login", () => {
  it("redirects to the OAuth authorization URL with correct params [AUTH-001]", async () => {
    const { loader } = await import("./login");
    const request = new Request("http://localhost:3000/auth/login?returnTo=/app/dashboard");

    const res = await loader({ request }) as unknown as Response;
    expect(res.status).toBe(302);

    const location = res.headers.get("Location")!;
    expect(location).toContain("https://auth.example.com/authorize");

    const redirectUrl = new URL(location);
    expect(redirectUrl.searchParams.get("response_type")).toBe("code");
    expect(redirectUrl.searchParams.get("client_id")).toBe("test-client-id");
    expect(redirectUrl.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/callback");
    expect(redirectUrl.searchParams.get("scope")).toBe("openid profile email");
  });

  it("encodes returnTo in the state parameter", async () => {
    const { loader } = await import("./login");
    const request = new Request("http://localhost:3000/auth/login?returnTo=/app/board/123");

    const res = await loader({ request }) as unknown as Response;
    const location = res.headers.get("Location")!;
    const redirectUrl = new URL(location);
    const state = redirectUrl.searchParams.get("state")!;
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    expect(decoded.returnTo).toBe("/app/board/123");
    expect(decoded.nonce).toBeDefined();
  });

  it("sets the session cookie in the response", async () => {
    const { loader } = await import("./login");
    const request = new Request("http://localhost:3000/auth/login");

    const res = await loader({ request }) as unknown as Response;
    expect(res.headers.get("Set-Cookie")).toBe("session-cookie-value");
  });
});

// BRD-021: the Log in links under a board carry a ref, so the click is
// counted against the board it came from before sign-in starts.
describe("GET /auth/login from a board's Log in link [BRD-021]", () => {
  beforeEach(() => {
    mockRecordGrowthEvent.mockClear();
    seed.userId = undefined;
  });

  it("records a keep_click for the kept-until line, with the board and the guest", async () => {
    seed.userId = "guest-1";
    const { loader } = await import("./login");
    const request = new Request("http://localhost:3000/auth/login?returnTo=%2Fapp%2Fboard%2Fboard-1&ref=keep-notice");

    const res = (await loader({ request })) as unknown as Response;

    expect(mockRecordGrowthEvent).toHaveBeenCalledWith("keep_click", { boardId: "board-1", userId: "guest-1" });
    expect(res.status).toBe(302);
  });

  it("records a claim_reminder_click for the claim reminder", async () => {
    const { loader } = await import("./login");
    const request = new Request("http://localhost:3000/auth/login?returnTo=%2Fapp%2Fboard%2Fboard-1&ref=claim-reminder");

    await loader({ request });

    expect(mockRecordGrowthEvent).toHaveBeenCalledWith("claim_reminder_click", { boardId: "board-1", userId: null });
  });

  it("records nothing for a login without a known ref", async () => {
    const { loader } = await import("./login");

    await loader({ request: new Request("http://localhost:3000/auth/login?returnTo=/app/dashboard") });
    await loader({ request: new Request("http://localhost:3000/auth/login?returnTo=/app/board/b&ref=other") });

    expect(mockRecordGrowthEvent).not.toHaveBeenCalled();
  });
});
