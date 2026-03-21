import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
  destroySession: vi.fn(async () => "destroyed-cookie-value"),
}));

beforeEach(() => {
  delete process.env.LOGOUT_REDIRECT_URL;
});

describe("GET /auth/logout", () => {
  it("destroys the session and redirects to /", async () => {
    const { loader } = await import("./logout");
    const request = new Request("http://localhost:3000/auth/logout");

    const res = await loader({ request }) as unknown as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
    expect(res.headers.get("Set-Cookie")).toBe("destroyed-cookie-value");
  });

  it("redirects to LOGOUT_REDIRECT_URL when set", async () => {
    process.env.LOGOUT_REDIRECT_URL = "https://auth.example.com/logout";
    const { loader } = await import("./logout");
    const request = new Request("http://localhost:3000/auth/logout");

    const res = await loader({ request }) as unknown as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://auth.example.com/logout");
  });
});
