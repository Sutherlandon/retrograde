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
const SITE_ADMIN_EXT_ID = "site-admin-ext-123";

vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  siteAdminIds: [SITE_ADMIN_EXT_ID],
}));

vi.mock("~/server/db_init", () => ({}));

const mockGetMetrics      = vi.fn();
const mockIsGrantedAdmin  = vi.fn();
const mockListGranted     = vi.fn();

vi.mock("~/server/metrics_model", () => ({
  getMetrics: (...args: unknown[]) => mockGetMetrics(...args),
}));

vi.mock("~/server/admin_model", () => ({
  isGrantedAdmin:    (...args: unknown[]) => mockIsGrantedAdmin(...args),
  listGrantedAdmins: (...args: unknown[]) => mockListGranted(...args),
}));

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { usernameField: "preferred_username" },
}));

const SAMPLE_METRICS = { registeredUsers: 10, totalNotes: 50, activeBoards: 3, engagedUsers: 7 };
const SAMPLE_GRANTED = [{ id: "au-1", userId: "u-2", username: "alice", grantedBy: SITE_ADMIN_EXT_ID, createdAt: "2025-01-01T00:00:00Z" }];

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockGetMetrics.mockResolvedValue(SAMPLE_METRICS);
  mockListGranted.mockResolvedValue(SAMPLE_GRANTED);
  mockIsGrantedAdmin.mockResolvedValue(false);
});

// Sets up a logged-in session. Pool calls:
//   1. requireRegisteredUser → SELECT * FROM users WHERE id
//   2. loader → SELECT external_id FROM users WHERE id
function loginAs(userId: string, externalId: string, isAnonymous = false) {
  sessionData["userId"] = userId;
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ id: userId, preferred_username: "testuser", is_anonymous: isAnonymous }],
    rowCount: 1,
  });
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ external_id: externalId }],
    rowCount: 1,
  });
}

describe("admin dashboard loader — site admin", () => {
  it("returns metrics, isSiteAdmin: true, and grantedAdmins", async () => {
    const { loader } = await import("./admin.dashboard");
    loginAs("admin-1", SITE_ADMIN_EXT_ID);

    const result = await loader({ request: new Request("http://localhost:3000/app/admin/dashboard") });

    expect(result).toEqual({
      metrics: SAMPLE_METRICS,
      isSiteAdmin: true,
      grantedAdmins: SAMPLE_GRANTED,
    });
    expect(mockIsGrantedAdmin).not.toHaveBeenCalled();
  });

  it("does not call isGrantedAdmin for site admins", async () => {
    const { loader } = await import("./admin.dashboard");
    loginAs("admin-1", SITE_ADMIN_EXT_ID);

    await loader({ request: new Request("http://localhost:3000/app/admin/dashboard") });

    expect(mockIsGrantedAdmin).not.toHaveBeenCalled();
  });
});

describe("admin dashboard loader — granted admin", () => {
  it("returns metrics and isSiteAdmin: false with empty grantedAdmins", async () => {
    const { loader } = await import("./admin.dashboard");
    loginAs("user-2", "other-ext-id");
    mockIsGrantedAdmin.mockResolvedValueOnce(true);

    const result = await loader({ request: new Request("http://localhost:3000/app/admin/dashboard") });

    expect(result).toEqual({
      metrics: SAMPLE_METRICS,
      isSiteAdmin: false,
      grantedAdmins: [],
    });
    expect(mockListGranted).not.toHaveBeenCalled();
  });
});

describe("admin dashboard loader — access denied", () => {
  it("throws 403 when user is neither site admin nor granted admin", async () => {
    const { loader } = await import("./admin.dashboard");
    loginAs("user-3", "unrecognised-ext-id");
    mockIsGrantedAdmin.mockResolvedValueOnce(false);

    try {
      await loader({ request: new Request("http://localhost:3000/app/admin/dashboard") });
      expect.unreachable("should have thrown 403");
    } catch (res: unknown) {
      expect((res as Response).status).toBe(403);
    }
  });

  it("throws 403 when the users row has no external_id and is not a granted admin", async () => {
    const { loader } = await import("./admin.dashboard");
    sessionData["userId"] = "user-4";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-4", preferred_username: "testuser", is_anonymous: false }],
      rowCount: 1,
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no external_id
    mockIsGrantedAdmin.mockResolvedValueOnce(false);

    try {
      await loader({ request: new Request("http://localhost:3000/app/admin/dashboard") });
      expect.unreachable("should have thrown 403");
    } catch (res: unknown) {
      expect((res as Response).status).toBe(403);
    }
  });

  it("redirects unauthenticated users to login", async () => {
    const { loader } = await import("./admin.dashboard");

    try {
      await loader({ request: new Request("http://localhost:3000/app/admin/dashboard") });
      expect.unreachable("should have thrown a redirect");
    } catch (res: unknown) {
      const r = res as Response;
      expect(r.status).toBe(302);
      expect(r.headers.get("Location")).toContain("/auth/login");
    }
  });

  it("redirects anonymous users to login", async () => {
    const { loader } = await import("./admin.dashboard");
    loginAs("anon-1", "ext-anon", true);

    try {
      await loader({ request: new Request("http://localhost:3000/app/admin/dashboard") });
      expect.unreachable("should have thrown a redirect");
    } catch (res: unknown) {
      expect((res as Response).status).toBe(302);
    }
  });

  it("does not call getMetrics when access is denied", async () => {
    const { loader } = await import("./admin.dashboard");
    loginAs("user-5", "unrecognised");
    mockIsGrantedAdmin.mockResolvedValueOnce(false);

    try {
      await loader({ request: new Request("http://localhost:3000/app/admin/dashboard") });
    } catch { /* expected 403 */ }

    expect(mockGetMetrics).not.toHaveBeenCalled();
  });
});
