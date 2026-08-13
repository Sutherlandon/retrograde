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

describe("getBoardAccess", () => {
  function accessRow(over: Record<string, unknown> = {}) {
    return {
      rowCount: 1,
      rows: [{
        team_id: "team-1", restricted: true,
        is_team_member: false, is_board_member: false, is_registered: true,
        ...over,
      }],
    };
  }

  it("reports a missing board", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await getBoardAccess("missing", "user-1")).toEqual({
      exists: false, allowed: false, userIsRegistered: false,
    });
  });

  it("allows teamless boards", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(accessRow({ team_id: null, restricted: false }));
    expect((await getBoardAccess("b", "user-1")).allowed).toBe(true);
  });

  it("allows unrestricted crew boards to anyone", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(accessRow({ restricted: false }));
    expect((await getBoardAccess("b", null)).allowed).toBe(true);
  });

  it("denies a restricted board to a non-member", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(accessRow());
    expect((await getBoardAccess("b", "outsider")).allowed).toBe(false);
  });

  it("allows a restricted board to a crew member", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(accessRow({ is_team_member: true }));
    expect((await getBoardAccess("b", "member")).allowed).toBe(true);
  });

  it("allows an agent whose API key belongs to the board's crew", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(accessRow());
    expect((await getBoardAccess("b", "agent", "team-1")).allowed).toBe(true);
  });

  it("denies an agent whose API key is for a different crew", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(accessRow());
    expect((await getBoardAccess("b", "agent", "team-9")).allowed).toBe(false);
  });
});
