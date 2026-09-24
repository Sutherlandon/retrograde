// app/session.server.test.ts
// SESSION_SECRET and NODE_ENV are validated once in db_config.ts (CLAUDE.md
// rule 5). The session cookie is signed with that secret and marked Secure in
// production, where the app is served over HTTPS.
import { describe, it, expect, vi, beforeEach } from "vitest";

const config = vi.hoisted(() => ({ isProduction: false }));
vi.mock("~/server/db_config", () => ({
  sessionSecret: "test-session-secret",
  get isProduction() {
    return config.isProduction;
  },
}));

beforeEach(() => {
  vi.resetModules();
  config.isProduction = false;
});

async function signedInCookie(): Promise<string> {
  const { getSession, commitSession } = await import("./session.server");
  const session = await getSession();
  session.set("userId", "user-1");
  return commitSession(session);
}

describe("session cookie", () => {
  it("is marked Secure in production", async () => {
    config.isProduction = true;
    expect(await signedInCookie()).toMatch(/;\s*Secure/i);
  });

  it("is not marked Secure in local development", async () => {
    expect(await signedInCookie()).not.toMatch(/Secure/i);
  });

  it("is signed with SESSION_SECRET, so a forged signature yields no session", async () => {
    const pair = (await signedInCookie()).split(";")[0];
    const { getSession } = await import("./session.server");
    expect((await getSession(pair)).get("userId")).toBe("user-1");

    const forged = pair.replace(/\.[^.]+$/, ".forged-signature");
    expect((await getSession(forged)).get("userId")).toBeUndefined();
  });
});
