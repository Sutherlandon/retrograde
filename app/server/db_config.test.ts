import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("pg", () => ({
  Pool: class {},
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  process.env.DATABASE_URL = "postgresql://user:pass@host/db";
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_ENV;
  delete process.env.OAUTH_REDIRECT_URI;
});

afterEach(() => {
  process.env = originalEnv;
});

describe("oauthRedirectUri", () => {
  it("uses OAUTH_REDIRECT_URI in local dev (no VERCEL_ENV)", async () => {
    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    const { oauthRedirectUri } = await import("./db_config");
    expect(oauthRedirectUri).toBe("http://localhost:3000/auth/callback");
  });

  it("uses VERCEL_URL when VERCEL_ENV is preview", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "retrograde-abc123.vercel.app";
    process.env.OAUTH_REDIRECT_URI = "https://retrograde.example.com/auth/callback";
    const { oauthRedirectUri } = await import("./db_config");
    expect(oauthRedirectUri).toBe("https://retrograde-abc123.vercel.app/auth/callback");
  });

  it("uses OAUTH_REDIRECT_URI in production even when VERCEL_URL is set", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "retrograde-prod.vercel.app";
    process.env.OAUTH_REDIRECT_URI = "https://retrograde.example.com/auth/callback";
    const { oauthRedirectUri } = await import("./db_config");
    expect(oauthRedirectUri).toBe("https://retrograde.example.com/auth/callback");
  });

  it("falls back to OAUTH_REDIRECT_URI in preview when VERCEL_URL missing", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.OAUTH_REDIRECT_URI = "https://retrograde.example.com/auth/callback";
    const { oauthRedirectUri } = await import("./db_config");
    expect(oauthRedirectUri).toBe("https://retrograde.example.com/auth/callback");
  });
});
