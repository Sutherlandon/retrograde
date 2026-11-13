import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));
vi.mock("~/server/db_init", () => ({}));

// requireBoardAccess and requireFacilitator resolve the caller the same way —
// API key, agent_token or session — so one request has one identity.
const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getApiUser: (...args: unknown[]) => mockGetApiUser(...args),
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

  it("counts the owner of the board's crew as a facilitator (ADR-0027)", async () => {
    const { userCanFacilitate } = await import("./board_permissions");
    const { canFacilitateSql } = await import("./board_permissions_sql");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: true }] });
    await userCanFacilitate("crew-owner-1", "board-1");
    expect(mockPoolQuery.mock.calls[0][0]).toContain(canFacilitateSql("b", "$2::uuid"));
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
  it("admits an agent whose API key resolves to a board facilitator (ADR-0027)", async () => {
    const { requireFacilitator } = await import("./board_permissions");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1", username: "Timekeeper", teamId: "team-a" });
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: true }] });
    const user = await requireFacilitator(new Request("http://x", { headers: { Authorization: "Bearer rk_live_x" } }), "board-1");
    expect(user).toEqual({ id: "agent-1", username: "Timekeeper", teamId: "team-a" });
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["board-1", "agent-1"]);
  });

  it("returns the user when allowed", async () => {
    const { requireFacilitator } = await import("./board_permissions");
    mockGetApiUser.mockResolvedValueOnce({ id: "user-1", username: "landon" });
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ can: true }] });

    const user = await requireFacilitator(new Request("http://x"), "board-1");
    expect(user).toEqual({ id: "user-1", username: "landon" });
  });

  it("throws 403 when not allowed", async () => {
    const { requireFacilitator } = await import("./board_permissions");
    mockGetApiUser.mockResolvedValueOnce({ id: "user-2", username: "eve" });
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
    mockGetApiUser.mockResolvedValueOnce(null);
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
    mockGetApiUser.mockResolvedValueOnce(null);
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
        version: "0", timer_expired: false,
        ...over,
      }],
    };
  }

  it("reports a missing board", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await getBoardAccess("missing", "user-1")).toEqual({
      exists: false, allowed: false, userIsRegistered: false, version: 0, timerExpired: false,
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

describe("getBoardAccess version and timer (ADR-0029)", () => {
  const row = (over: Record<string, unknown>) => ({
    rowCount: 1,
    rows: [{
      team_id: null, restricted: false, is_team_member: false, is_board_member: false,
      is_registered: true, version: "0", timer_expired: false, ...over,
    }],
  });

  it("selects the version as text and the timer expiry in the same query", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(row({}));
    await getBoardAccess("b", "u");
    const sql = mockPoolQuery.mock.calls[0][0] as string;
    expect(sql).toContain("board_versions");
    expect(sql).toContain("::text AS version");
    expect(sql).toContain("timer_running AND b.timer_ends_at <= NOW()");
  });

  it("parses the version and reports timerExpired", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(row({ version: "42", timer_expired: true }));
    const a = await getBoardAccess("b", "u");
    expect(a.version).toBe(42);
    expect(a.timerExpired).toBe(true);
  });

  it("treats a missing version as 0", async () => {
    const { getBoardAccess } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(row({ version: null, timer_expired: null }));
    const a = await getBoardAccess("b", "u");
    expect(a.version).toBe(0);
    expect(a.timerExpired).toBe(false);
  });
});

describe("resolveBoardAccess / requireBoardAccess", () => {
  const accessRow = (over: Record<string, unknown> = {}) => ({
    rowCount: 1,
    rows: [{
      team_id: null, restricted: false, is_team_member: false, is_board_member: false,
      is_registered: true, version: "7", timer_expired: false, ...over,
    }],
  });
  const req = () => new Request("http://x/app/board/b/poll");

  async function thrown(p: Promise<unknown>): Promise<Response> {
    try { await p; } catch (e) { return e as Response; }
    throw new Error("expected a throw");
  }

  it("returns the caller and the access row", async () => {
    const { resolveBoardAccess } = await import("./board_permissions");
    mockGetApiUser.mockResolvedValueOnce({ id: "u1" });
    mockPoolQuery.mockResolvedValueOnce(accessRow());
    const r = await resolveBoardAccess(req(), "b");
    expect(r.user).toEqual({ id: "u1" });
    expect(r.access).toMatchObject({ exists: true, allowed: true, version: 7 });
  });

  it("requireBoardAccess returns just the caller", async () => {
    const { requireBoardAccess } = await import("./board_permissions");
    mockGetApiUser.mockResolvedValueOnce({ id: "u1" });
    mockPoolQuery.mockResolvedValueOnce(accessRow());
    expect(await requireBoardAccess(req(), "b")).toEqual({ id: "u1" });
  });

  it("throws 404 for a missing board", async () => {
    const { resolveBoardAccess } = await import("./board_permissions");
    mockGetApiUser.mockResolvedValueOnce(null);
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect((await thrown(resolveBoardAccess(req(), "b"))).status).toBe(404);
  });

  it("throws 401 for an unregistered caller on a restricted board, a login redirect when asked", async () => {
    const { resolveBoardAccess } = await import("./board_permissions");
    const restricted = accessRow({ team_id: "t", restricted: true, is_registered: false });
    mockGetApiUser.mockResolvedValue(null);
    mockPoolQuery.mockResolvedValueOnce(restricted);
    expect((await thrown(resolveBoardAccess(req(), "b"))).status).toBe(401);
    mockPoolQuery.mockResolvedValueOnce(restricted);
    const redirected = await thrown(resolveBoardAccess(req(), "b", { loginRedirect: true }));
    expect(redirected.status).toBe(302);
    expect(redirected.headers.get("Location")).toContain("/auth/login?returnTo=");
  });

  it("throws 403 for a registered non-member of a restricted board", async () => {
    const { requireBoardAccess } = await import("./board_permissions");
    mockGetApiUser.mockResolvedValueOnce({ id: "u1" });
    mockPoolQuery.mockResolvedValueOnce(accessRow({ team_id: "t", restricted: true }));
    expect((await thrown(requireBoardAccess(req(), "b"))).status).toBe(403);
  });
});

describe("lockReason", () => {
  const row = (notes_locked: boolean, board_locked: boolean) => ({
    rowCount: 1,
    rows: [{ notes_locked, board_locked }],
  });

  it("returns null when the checked locks are off", async () => {
    const { lockReason } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(row(false, false));
    expect(await lockReason("board-1", { notes: true, board: true })).toBeNull();
  });

  it("names the board lock for a board: true check", async () => {
    const { lockReason } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(row(false, true));
    expect(await lockReason("board-1", { board: true })).toBe("Board is locked");
  });

  it("names the notes lock for a notes: true check when either lock is set", async () => {
    const { lockReason } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(row(true, false));
    expect(await lockReason("board-1", { notes: true })).toBe("Notes are locked");
    mockPoolQuery.mockResolvedValueOnce(row(false, true));
    expect(await lockReason("board-1", { notes: true })).toBe("Notes are locked");
  });

  it("ignores notes_locked for a board: true check", async () => {
    const { lockReason } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce(row(true, false));
    expect(await lockReason("board-1", { board: true })).toBeNull();
  });

  it("returns null for a missing board (the caller's access check owns 404)", async () => {
    const { lockReason } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await lockReason("missing", { notes: true, board: true })).toBeNull();
  });
});

describe("requireUnlocked", () => {
  it("passes through when neither lock is set", async () => {
    const { requireUnlocked } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ notes_locked: false, board_locked: false }],
    });
    await expect(requireUnlocked("board-1", { notes: true, board: true })).resolves.toBeUndefined();
  });

  it("throws 423 'Board is locked' when board is locked and board: true is checked", async () => {
    const { requireUnlocked } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ notes_locked: false, board_locked: true }],
    });
    try {
      await requireUnlocked("board-1", { board: true });
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(423);
      expect(await (response as Response).text()).toBe("Board is locked");
    }
  });

  it("throws 423 'Notes are locked' when notes_locked and notes: true is checked", async () => {
    const { requireUnlocked } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ notes_locked: true, board_locked: false }],
    });
    try {
      await requireUnlocked("board-1", { notes: true });
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(423);
      expect(await (response as Response).text()).toBe("Notes are locked");
    }
  });

  it("also blocks a notes: true check when only board_locked is set", async () => {
    const { requireUnlocked } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ notes_locked: false, board_locked: true }],
    });
    try {
      await requireUnlocked("board-1", { notes: true });
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(423);
    }
  });

  it("does not throw for a board: true check when only notes_locked is set", async () => {
    const { requireUnlocked } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ notes_locked: true, board_locked: false }],
    });
    await expect(requireUnlocked("board-1", { board: true })).resolves.toBeUndefined();
  });

  it("is a no-op when no flags are passed", async () => {
    const { requireUnlocked } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ notes_locked: true, board_locked: true }],
    });
    await expect(requireUnlocked("board-1", {})).resolves.toBeUndefined();
  });

  it("is a no-op when the board is missing (caller's own access check owns 404)", async () => {
    const { requireUnlocked } = await import("./board_permissions");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(requireUnlocked("missing", { notes: true, board: true })).resolves.toBeUndefined();
  });
});
