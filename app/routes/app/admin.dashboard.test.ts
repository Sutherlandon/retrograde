import { describe, it, expect, vi, beforeEach } from "vitest";

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
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

vi.mock("~/server/db_init", () => ({}));

const mockGetMetrics = vi.fn();
vi.mock("~/server/metrics_model", () => ({
  getMetrics: (...args: unknown[]) => mockGetMetrics(...args),
}));

const ADMIN_EXTERNAL_ID = "admin-ext-id-123";

vi.mock("~/config/siteConfig", () => ({
  siteConfig: {
    usernameField: "preferred_username",
    adminUsers: [ADMIN_EXTERNAL_ID],
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// Sets up a logged-in session. The first pool.query call is the user lookup
// from requireRegisteredUser; the second is the external_id lookup in the loader.
function loginAs(userId: string, externalId: string, isAnonymous = false) {
  sessionData["userId"] = userId;
  // requireRegisteredUser → SELECT * FROM users WHERE id = $1
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ id: userId, preferred_username: "testuser", is_anonymous: isAnonymous }],
    rowCount: 1,
  });
  // loader → SELECT external_id FROM users WHERE id = $1
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ external_id: externalId }],
    rowCount: 1,
  });
}

const SAMPLE_METRICS = {
  registeredUsers: 50,
  totalNotes: 200,
  activeBoards: 10,
  engagedUsers: 40,
};

describe("admin dashboard loader", () => {
  it("returns metrics for a user in adminUsers", async () => {
    const { loader } = await import("./admin.dashboard");

    loginAs("user-1", ADMIN_EXTERNAL_ID);
    mockGetMetrics.mockResolvedValueOnce(SAMPLE_METRICS);

    const request = new Request("http://localhost:3000/app/admin/dashboard");
    const result = await loader({ request });

    expect(result).toEqual({ metrics: SAMPLE_METRICS });
    expect(mockGetMetrics).toHaveBeenCalledTimes(1);
  });

  it("throws 403 for a registered user not in adminUsers", async () => {
    const { loader } = await import("./admin.dashboard");

    loginAs("user-2", "some-other-external-id");

    const request = new Request("http://localhost:3000/app/admin/dashboard");

    try {
      await loader({ request });
      expect.unreachable("should have thrown 403");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
  });

  it("throws 403 when the user row has no external_id", async () => {
    const { loader } = await import("./admin.dashboard");

    sessionData["userId"] = "user-3";
    // requireRegisteredUser
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-3", preferred_username: "testuser", is_anonymous: false }],
      rowCount: 1,
    });
    // external_id lookup returns empty
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const request = new Request("http://localhost:3000/app/admin/dashboard");

    try {
      await loader({ request });
      expect.unreachable("should have thrown 403");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
  });

  it("redirects to login when no session exists", async () => {
    const { loader } = await import("./admin.dashboard");

    const request = new Request("http://localhost:3000/app/admin/dashboard");

    try {
      await loader({ request });
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
    }
  });

  it("redirects anonymous users to login", async () => {
    const { loader } = await import("./admin.dashboard");

    sessionData["userId"] = "anon-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "anon-1", preferred_username: "Guest", is_anonymous: true }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/admin/dashboard");

    try {
      await loader({ request });
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
    }
  });

  it("does not call getMetrics when access is denied", async () => {
    const { loader } = await import("./admin.dashboard");

    loginAs("user-4", "not-an-admin");

    const request = new Request("http://localhost:3000/app/admin/dashboard");

    try {
      await loader({ request });
    } catch {
      // expected 403
    }

    expect(mockGetMetrics).not.toHaveBeenCalled();
  });
});
