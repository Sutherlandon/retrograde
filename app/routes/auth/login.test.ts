import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => {
    const data: Record<string, string> = {};
    return {
      get: (key: string) => data[key],
      set: (key: string, value: string) => { data[key] = value; },
      unset: (key: string) => { delete data[key]; },
      data,
    };
  }),
  commitSession: vi.fn(async () => "session-cookie-value"),
}));

beforeEach(() => {
  process.env.OAUTH_CLIENT_ID = "test-client-id";
  process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
  process.env.OAUTH_SCOPES = "openid profile email";
  process.env.OAUTH_AUTHORIZATION_URL = "https://auth.example.com/authorize";
  process.env.SESSION_SECRET = "test-secret";
});

describe("GET /auth/login", () => {
  it("redirects to the OAuth authorization URL with correct params", async () => {
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
