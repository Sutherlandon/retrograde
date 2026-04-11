import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  siteAdminIds: [],
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("isGrantedAdmin", () => {
  it("returns true when user_id is in admin_users", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 });

    const { isGrantedAdmin } = await import("./admin_model");
    expect(await isGrantedAdmin("user-1")).toBe(true);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("admin_users"),
      ["user-1"]
    );
  });

  it("returns false when user_id is not in admin_users", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { isGrantedAdmin } = await import("./admin_model");
    expect(await isGrantedAdmin("user-2")).toBe(false);
  });
});

describe("listGrantedAdmins", () => {
  it("returns formatted admin rows", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { id: "au-1", userId: "u-1", username: "alice", grantedBy: "ext-root", createdAt: "2025-01-01T00:00:00Z" },
        { id: "au-2", userId: "u-2", username: "bob",   grantedBy: "ext-root", createdAt: "2025-02-01T00:00:00Z" },
      ],
      rowCount: 2,
    });

    const { listGrantedAdmins } = await import("./admin_model");
    const result = await listGrantedAdmins();

    expect(result).toHaveLength(2);
    expect(result[0].username).toBe("alice");
    expect(result[1].username).toBe("bob");
  });

  it("returns empty array when no granted admins exist", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { listGrantedAdmins } = await import("./admin_model");
    expect(await listGrantedAdmins()).toEqual([]);
  });
});

describe("findRegisteredUserByUsername", () => {
  it("returns the user when found", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "u-1", username: "alice" }],
      rowCount: 1,
    });

    const { findRegisteredUserByUsername } = await import("./admin_model");
    const result = await findRegisteredUserByUsername("alice");

    expect(result).toEqual({ id: "u-1", username: "alice" });
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("is_anonymous = FALSE"),
      ["alice"]
    );
  });

  it("returns null when no user is found", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const { findRegisteredUserByUsername } = await import("./admin_model");
    expect(await findRegisteredUserByUsername("unknown")).toBeNull();
  });
});

describe("addGrantedAdmin", () => {
  it("inserts with ON CONFLICT DO NOTHING", async () => {
    const { addGrantedAdmin } = await import("./admin_model");
    await addGrantedAdmin("u-1", "ext-root");

    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (user_id) DO NOTHING"),
      ["u-1", "ext-root"]
    );
  });
});

describe("removeGrantedAdmin", () => {
  it("deletes the row for the given userId", async () => {
    const { removeGrantedAdmin } = await import("./admin_model");
    await removeGrantedAdmin("u-1");

    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM admin_users"),
      ["u-1"]
    );
  });
});
