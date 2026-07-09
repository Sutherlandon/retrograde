import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));
vi.mock("~/server/db_init", () => ({}));

const mockGetOptionalUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getOptionalUser: (...args: unknown[]) => mockGetOptionalUser(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("userCanFacilitate", () => {
  it("returns true when the SQL check passes", async () => {
    const { userCanFacilitate } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: true }] });
    expect(await userCanFacilitate("user-1", "board-1")).toBe(true);
    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("open_facilitation");
    expect(call[0]).toContain("role IN ('owner', 'facilitator')");
    expect(call[1]).toEqual(["board-1", "user-1"]);
  });

  it("returns false when board not found", async () => {
    const { userCanFacilitate } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await userCanFacilitate("user-1", "missing")).toBe(false);
  });

  it("passes null userId through for anonymous callers", async () => {
    const { userCanFacilitate } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: false }] });
    expect(await userCanFacilitate(null, "board-1")).toBe(false);
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["board-1", null]);
  });
});

describe("requireFacilitator", () => {
  it("returns the user when allowed", async () => {
    const { requireFacilitator } = await import("./board_permissions");
    mockGetOptionalUser.mockResolvedValueOnce({ id: "user-1", username: "landon" });
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: true }] });

    const user = await requireFacilitator(new Request("http://x"), "board-1");
    expect(user).toEqual({ id: "user-1", username: "landon" });
  });

  it("throws 403 when not allowed", async () => {
    const { requireFacilitator } = await import("./board_permissions");
    mockGetOptionalUser.mockResolvedValueOnce({ id: "user-2", username: "eve" });
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: false }] });

    try {
      await requireFacilitator(new Request("http://x"), "board-1");
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
  });

  it("throws 401 when there is no session and the board is not open", async () => {
    const { requireFacilitator } = await import("./board_permissions");
    mockGetOptionalUser.mockResolvedValueOnce(null);
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: false }] });

    try {
      await requireFacilitator(new Request("http://x"), "board-1");
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(401);
    }
  });

  it("admits an anonymous caller when open_facilitation allows it", async () => {
    const { requireFacilitator } = await import("./board_permissions");
    mockGetOptionalUser.mockResolvedValueOnce(null);
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: true }] });

    const user = await requireFacilitator(new Request("http://x"), "board-1");
    expect(user).toBeNull();
  });
});
