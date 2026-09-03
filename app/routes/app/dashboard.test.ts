import { describe, it, expect, vi, beforeEach } from "vitest";

// Track session data across mock calls
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
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { usernameField: "preferred_username" },
}));

const mockArchiveBoard = vi.fn();
const mockUnarchiveBoard = vi.fn();
const mockMoveBoards = vi.fn();
const mockBulkDelete = vi.fn();

const mockCreateBoard = vi.fn();
const mockListVisibleBoards = vi.fn();
vi.mock("~/server/board_model", () => ({
  createBoard: (...args: unknown[]) => mockCreateBoard(...args),
  listVisibleBoards: (...args: unknown[]) => mockListVisibleBoards(...args),
  duplicateBoardServer: vi.fn(),
  deleteBoardServer: vi.fn(),
  archiveBoardServer: (...args: unknown[]) => mockArchiveBoard(...args),
  unarchiveBoardServer: (...args: unknown[]) => mockUnarchiveBoard(...args),
  moveBoardsToTeamServer: (...args: unknown[]) => mockMoveBoards(...args),
  bulkDeleteBoardsServer: (...args: unknown[]) => mockBulkDelete(...args),
}));

const mockListTeams = vi.fn();
const mockGetPersonalTeam = vi.fn();
const mockUserIsTeamMember = vi.fn();
vi.mock("~/server/team_model", () => ({
  getPersonalTeamForUser: (...args: unknown[]) => mockGetPersonalTeam(...args),
  listTeamsForUser: (...args: unknown[]) => mockListTeams(...args),
  userIsTeamMember: (...args: unknown[]) => mockUserIsTeamMember(...args),
}));

const mockListOpenItems = vi.fn();
vi.mock("~/server/action_item_model", () => ({
  listOpenActionItemsForUser: (...args: unknown[]) => mockListOpenItems(...args),
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockListTeams.mockResolvedValue([]);
  mockListOpenItems.mockResolvedValue([]);
  mockListVisibleBoards.mockResolvedValue([]);
  mockGetPersonalTeam.mockResolvedValue({ id: "personal-1" });
  mockUserIsTeamMember.mockResolvedValue(true);
  mockCreateBoard.mockResolvedValue("board-new");
});

// Helper: mock a logged-in registered user (first pool query = user lookup)
function loginAs(userId: string) {
  sessionData["userId"] = userId;
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ id: userId, preferred_username: "realuser", is_anonymous: false }],
    rowCount: 1,
  });
}

describe("dashboard loader", () => {
  it("returns boards, teams, and open action items with default sort 'updated' (DASH-001, DASH-002, DASH-015)", async () => {
    const { loader } = await import("./dashboard");

    loginAs("user-1");
    mockListVisibleBoards
      .mockResolvedValueOnce([{ id: "board-1", title: "Sprint Retro", role: "owner" }])   // active
      .mockResolvedValueOnce([{ id: "board-2", title: "Old Retro", role: "owner", archived_at: "2025-01-01" }]); // archived
    mockListTeams.mockResolvedValueOnce([
      { id: "t1", name: "Design", is_personal: false, role: "owner", member_count: 2, board_count: 1, open_action_items: 3 },
    ]);
    mockListOpenItems.mockResolvedValueOnce([
      { id: "ai1", text: "Follow up", team_id: "t1", team_name: "Design", board_id: null, board_title: null, board_team_id: null },
    ]);

    const request = new Request("http://localhost:3000/app/dashboard");
    const result = await loader({ request });

    expect(result.boards).toEqual([{ id: "board-1", title: "Sprint Retro", role: "owner" }]);
    expect(result.archivedBoards).toHaveLength(1);
    expect(result.sort).toBe("updated");
    expect(result.teams).toHaveLength(1);
    expect(result.openItems).toHaveLength(1);
    expect(mockListTeams).toHaveBeenCalledWith("user-1");
    expect(mockListOpenItems).toHaveBeenCalledWith("user-1");
    // Default sort is most-recently-updated first
    expect(mockListVisibleBoards).toHaveBeenNthCalledWith(1, "user-1", { order: "updated_at DESC" });
  });

  it("respects the sort query param (DASH-005)", async () => {
    const { loader } = await import("./dashboard");

    loginAs("user-1");
    const request = new Request("http://localhost:3000/app/dashboard?sort=title");
    const result = await loader({ request });

    expect((result as { sort: string }).sort).toBe("title");
    expect(mockListVisibleBoards).toHaveBeenNthCalledWith(1, "user-1", { order: "title ASC" });
  });

  it("requests active boards and a separate archived list (DASH-014)", async () => {
    const { loader } = await import("./dashboard");

    loginAs("user-1");
    const request = new Request("http://localhost:3000/app/dashboard");
    await loader({ request });

    // Active list (no archived flag) then archived list.
    expect(mockListVisibleBoards).toHaveBeenNthCalledWith(1, "user-1", { order: "updated_at DESC" });
    expect(mockListVisibleBoards).toHaveBeenNthCalledWith(2, "user-1", { archived: true, order: "title ASC" });
  });

  it("redirects anonymous user to login", async () => {
    const { loader } = await import("./dashboard");

    sessionData["userId"] = "anon-user-1";
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "anon-user-1", preferred_username: "Guest", is_anonymous: true }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/dashboard");

    try {
      await loader({ request });
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
    }
  });

  it("redirects to login when no session exists", async () => {
    const { loader } = await import("./dashboard");

    const request = new Request("http://localhost:3000/app/dashboard");

    try {
      await loader({ request });
      expect.unreachable("should have thrown a redirect");
    } catch (response: unknown) {
      const res = response as Response;
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("/auth/login");
    }
  });
});

describe("dashboard action — archive / unarchive", () => {
  function makeRequest(intent: string, boardId: string) {
    const form = new FormData();
    form.append("intent", intent);
    form.append("boardId", boardId);
    return new Request("http://localhost:3000/app/dashboard", { method: "post", body: form });
  }

  it("archives a board when intent is 'archive'", async () => {
    const { action } = await import("./dashboard");

    loginAs("user-1");
    mockArchiveBoard.mockResolvedValueOnce(undefined);

    const request = makeRequest("archive", "board-1");
    const result = await action({ request } as never);

    expect(mockArchiveBoard).toHaveBeenCalledWith("board-1", "user-1");
    expect(result).toBeNull();
  });

  it("unarchives a board when intent is 'unarchive'", async () => {
    const { action } = await import("./dashboard");

    loginAs("user-1");
    mockUnarchiveBoard.mockResolvedValueOnce(undefined);

    const request = makeRequest("unarchive", "board-1");
    const result = await action({ request } as never);

    expect(mockUnarchiveBoard).toHaveBeenCalledWith("board-1", "user-1");
    expect(result).toBeNull();
  });

  it("throws 400 when boardId is missing on archive", async () => {
    const { action } = await import("./dashboard");

    loginAs("user-1");

    const form = new FormData();
    form.append("intent", "archive");
    const request = new Request("http://localhost:3000/app/dashboard", { method: "post", body: form });

    try {
      await action({ request } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(400);
    }
  });
});

describe("dashboard action — move to team / bulk operations", () => {
  function makeFormRequest(fields: Record<string, string>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return new Request("http://localhost:3000/app/dashboard", { method: "post", body: form });
  }

  it("moves a single board to a team", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");
    mockMoveBoards.mockResolvedValueOnce(["board-1"]);

    const result = await action({
      request: makeFormRequest({ intent: "moveBoard", boardId: "board-1", teamId: "team-9" }),
    } as never);

    expect(mockMoveBoards).toHaveBeenCalledWith(["board-1"], "team-9", "user-1");
    expect(result).toEqual({ moved: 1 });
  });

  it("moves a board to no team when teamId is 'none'", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");
    mockMoveBoards.mockResolvedValueOnce(["board-1"]);

    await action({
      request: makeFormRequest({ intent: "moveBoard", boardId: "board-1", teamId: "none" }),
    } as never);

    expect(mockMoveBoards).toHaveBeenCalledWith(["board-1"], null, "user-1");
  });

  it("bulk-moves selected boards to a team", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");
    mockMoveBoards.mockResolvedValueOnce(["b1", "b2"]);

    const result = await action({
      request: makeFormRequest({ intent: "bulkMove", boardIds: "b1,b2,b3", teamId: "team-9" }),
    } as never);

    expect(mockMoveBoards).toHaveBeenCalledWith(["b1", "b2", "b3"], "team-9", "user-1");
    expect(result).toEqual({ moved: 2 });
  });

  it("bulk-deletes selected boards", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");
    mockBulkDelete.mockResolvedValueOnce(["b1", "b2"]);

    const result = await action({
      request: makeFormRequest({ intent: "bulkDelete", boardIds: "b1,b2" }),
    } as never);

    expect(mockBulkDelete).toHaveBeenCalledWith(["b1", "b2"], "user-1");
    expect(result).toEqual({ deleted: 2 });
  });

  it("throws 400 when moveBoard is missing boardId or teamId", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");
    try {
      await action({ request: makeFormRequest({ intent: "moveBoard", boardId: "b1" }) } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(400);
    }
  });

  it("throws 400 when bulk intents have no boardIds", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");
    try {
      await action({ request: makeFormRequest({ intent: "bulkDelete", boardIds: "" }) } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(400);
    }
  });
});

describe("dashboard action — create board with selected crew", () => {
  function makeCreateRequest(fields: Record<string, string> = {}) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return new Request("http://localhost:3000/app/dashboard", { method: "post", body: form });
  }

  it("assigns a new board to the personal team when no crew is selected (DASH-003)", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");

    const res = (await action({ request: makeCreateRequest({ title: "Fresh Retro" }) } as never)) as Response;

    expect(mockCreateBoard).toHaveBeenCalledWith("Fresh Retro", "user-1", "personal-1");
    expect(res.headers.get("Location")).toBe("/app/board/board-new");
  });

  it("assigns a new board to the selected crew when the user is a member", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");
    mockUserIsTeamMember.mockResolvedValueOnce(true);

    await action({ request: makeCreateRequest({ title: "Crew Retro", teamId: "crew-9" }) } as never);

    expect(mockUserIsTeamMember).toHaveBeenCalledWith("user-1", "crew-9");
    expect(mockCreateBoard).toHaveBeenCalledWith("Crew Retro", "user-1", "crew-9");
  });

  it("falls back to the personal team when the user is not a member of the selected crew", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");
    mockUserIsTeamMember.mockResolvedValueOnce(false);

    await action({ request: makeCreateRequest({ title: "Sneaky", teamId: "not-mine" }) } as never);

    expect(mockCreateBoard).toHaveBeenCalledWith("Sneaky", "user-1", "personal-1");
  });

  it("ignores the 'all' filter value and uses the personal team", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");

    await action({ request: makeCreateRequest({ title: "All View", teamId: "all" }) } as never);

    expect(mockUserIsTeamMember).not.toHaveBeenCalled();
    expect(mockCreateBoard).toHaveBeenCalledWith("All View", "user-1", "personal-1");
  });

  it("ignores the 'unassigned' filter value and uses the personal team", async () => {
    const { action } = await import("./dashboard");
    loginAs("user-1");

    await action({ request: makeCreateRequest({ title: "Unassigned View", teamId: "unassigned" }) } as never);

    expect(mockUserIsTeamMember).not.toHaveBeenCalled();
    expect(mockCreateBoard).toHaveBeenCalledWith("Unassigned View", "user-1", "personal-1");
  });
});

describe("fuzzyMatch (DASH-004)", () => {
  it("matches when the query is a subsequence of the text", async () => {
    const { fuzzyMatch } = await import("./dashboard");
    expect(fuzzyMatch("retrograde", "rtg")).toBe(true);
    expect(fuzzyMatch("Sprint Retro", "sprro")).toBe(true);
  });

  it("matches case-insensitively", async () => {
    const { fuzzyMatch } = await import("./dashboard");
    expect(fuzzyMatch("Retrograde", "RTG")).toBe(true);
    expect(fuzzyMatch("RETROGRADE", "rtg")).toBe(true);
  });

  it("does not match when the query's characters are out of order or missing", async () => {
    const { fuzzyMatch } = await import("./dashboard");
    expect(fuzzyMatch("retrograde", "gtr")).toBe(false);
    expect(fuzzyMatch("retrograde", "xyz")).toBe(false);
    expect(fuzzyMatch("short", "shortest")).toBe(false);
  });

  it("an empty query matches everything", async () => {
    const { fuzzyMatch } = await import("./dashboard");
    expect(fuzzyMatch("retrograde", "")).toBe(true);
    expect(fuzzyMatch("", "")).toBe(true);
  });
});
