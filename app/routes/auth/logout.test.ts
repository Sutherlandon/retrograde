import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
  destroySession: vi.fn(async () => "destroyed-cookie-value"),
}));

// OAUTH_LOGOUT_REDIRECT_URL is read and validated once in db_config.ts
// (ADR-0017), which also owns the "/" default.
const logout = vi.hoisted(() => ({ redirectUrl: "/" }));
vi.mock("~/server/db_config", () => ({
  get oauthLogoutRedirectUrl() {
    return logout.redirectUrl;
  },
}));

beforeEach(() => {
  logout.redirectUrl = "/";
});

describe("GET /auth/logout", () => {
  it("destroys the session and redirects to / [AUTH-003]", async () => {
    const { loader } = await import("./logout");
    const request = new Request("http://localhost:3000/auth/logout");

    const res = await loader({ request }) as unknown as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect(res.headers.get("Set-Cookie")).toBe("destroyed-cookie-value");
  });

  it("redirects to the configured OAUTH_LOGOUT_REDIRECT_URL", async () => {
    logout.redirectUrl = "https://auth.example.com/logout";
    const { loader } = await import("./logout");
    const request = new Request("http://localhost:3000/auth/logout");

    const res = await loader({ request }) as unknown as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://auth.example.com/logout");
    expect(res.headers.get("Set-Cookie")).toBe("destroyed-cookie-value");
  });
});
