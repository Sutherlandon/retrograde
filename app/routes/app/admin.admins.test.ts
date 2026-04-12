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

const mockAdd    = vi.fn();
const mockRemove = vi.fn();
const mockFind   = vi.fn();

vi.mock("~/server/admin_model", () => ({
  addGrantedAdmin:               (...args: unknown[]) => mockAdd(...args),
  removeGrantedAdmin:            (...args: unknown[]) => mockRemove(...args),
  findRegisteredUserByUsername:  (...args: unknown[]) => mockFind(...args),
}));

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { usernameField: "preferred_username" },
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

function loginAs(userId: string, externalId: string) {
  sessionData["userId"] = userId;
  // requireRegisteredUser → SELECT * FROM users WHERE id = $1
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ id: userId, preferred_username: "testuser", is_anonymous: false }],
    rowCount: 1,
  });
  // requireSiteAdmin → SELECT external_id FROM users WHERE id = $1
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ external_id: externalId }],
    rowCount: 1,
  });
}

function makeRequest(intent: string, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("intent", intent);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/admin/admins", { method: "post", body: form });
}

describe("admin.admins action — access control", () => {
  it("throws 403 for a non-site-admin registered user", async () => {
    const { action } = await import("./admin.admins");
    loginAs("user-1", "not-a-site-admin");

    try {
      await action({ request: makeRequest("add", { username: "someone" }) });
      expect.unreachable("should have thrown 403");
    } catch (res: unknown) {
      expect((res as Response).status).toBe(403);
    }
  });

  it("redirects to login when no session exists", async () => {
    const { action } = await import("./admin.admins");

    try {
      await action({ request: makeRequest("add", { username: "someone" }) });
      expect.unreachable("should have thrown a redirect");
    } catch (res: unknown) {
      expect((res as Response).status).toBe(302);
    }
  });
});

describe("admin.admins action — add intent", () => {
  it("adds a user and returns success", async () => {
    const { action } = await import("./admin.admins");
    loginAs("admin-1", SITE_ADMIN_EXT_ID);
    mockFind.mockResolvedValueOnce({ id: "target-1", username: "alice" });

    const result = await action({ request: makeRequest("add", { username: "alice" }) });

    expect(mockFind).toHaveBeenCalledWith("alice");
    expect(mockAdd).toHaveBeenCalledWith("target-1", SITE_ADMIN_EXT_ID);
    expect(result).toEqual({ success: true, addedUsername: "alice" });
  });

  it("returns error when username is empty", async () => {
    const { action } = await import("./admin.admins");
    loginAs("admin-1", SITE_ADMIN_EXT_ID);

    const result = await action({ request: makeRequest("add", { username: "  " }) });

    expect(mockFind).not.toHaveBeenCalled();
    expect(result).toEqual({ error: "Username is required." });
  });

  it("returns error when user is not found", async () => {
    const { action } = await import("./admin.admins");
    loginAs("admin-1", SITE_ADMIN_EXT_ID);
    mockFind.mockResolvedValueOnce(null);

    const result = await action({ request: makeRequest("add", { username: "ghost" }) });

    expect(mockAdd).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining("ghost") });
  });
});

describe("admin.admins action — remove intent", () => {
  it("removes a user and returns success", async () => {
    const { action } = await import("./admin.admins");
    loginAs("admin-1", SITE_ADMIN_EXT_ID);

    const result = await action({ request: makeRequest("remove", { userId: "target-1" }) });

    expect(mockRemove).toHaveBeenCalledWith("target-1");
    expect(result).toEqual({ success: true });
  });

  it("returns error when userId is missing", async () => {
    const { action } = await import("./admin.admins");
    loginAs("admin-1", SITE_ADMIN_EXT_ID);

    const result = await action({ request: makeRequest("remove") });

    expect(mockRemove).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: "Missing userId." });
  });
});

describe("admin.admins action — unknown intent", () => {
  it("throws 400 for an unrecognised intent", async () => {
    const { action } = await import("./admin.admins");
    loginAs("admin-1", SITE_ADMIN_EXT_ID);

    try {
      await action({ request: makeRequest("nuke") });
      expect.unreachable("should have thrown 400");
    } catch (res: unknown) {
      expect((res as Response).status).toBe(400);
    }
  });
});
