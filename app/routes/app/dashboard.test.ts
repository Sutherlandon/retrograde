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

vi.mock("~/server/board_model", () => ({
  createBoard: vi.fn(),
  duplicateBoardServer: vi.fn(),
  deleteBoardServer: vi.fn(),
  archiveBoardServer: (...args: unknown[]) => mockArchiveBoard(...args),
  unarchiveBoardServer: (...args: unknown[]) => mockUnarchiveBoard(...args),
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
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
  it("returns active and archived boards with default sort 'created'", async () => {
    const { loader } = await import("./dashboard");

    loginAs("user-1");
    // active boards query
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "board-1", title: "Sprint Retro", role: "owner" }],
      rowCount: 1,
    });
    // archived boards query
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "board-2", title: "Old Retro", role: "owner", archived_at: "2025-01-01" }],
      rowCount: 1,
    });

    const request = new Request("http://localhost:3000/app/dashboard");
    const result = await loader({ request });

    expect(result).toEqual({
      boards: [{ id: "board-1", title: "Sprint Retro", role: "owner" }],
      archivedBoards: [{ id: "board-2", title: "Old Retro", role: "owner", archived_at: "2025-01-01" }],
      sort: "created",
    });
  });

  it("respects the sort query param", async () => {
    const { loader } = await import("./dashboard");

    loginAs("user-1");
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // active boards
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // archived boards

    const request = new Request("http://localhost:3000/app/dashboard?sort=title");
    const result = await loader({ request });

    expect((result as { sort: string }).sort).toBe("title");
    // Verify the active boards query used title sort
    const activeBoardsCall = mockPoolQuery.mock.calls[1];
    expect(activeBoardsCall[0]).toContain("b.title ASC");
  });

  it("active boards query excludes archived boards", async () => {
    const { loader } = await import("./dashboard");

    loginAs("user-1");
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // active boards
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // archived boards

    const request = new Request("http://localhost:3000/app/dashboard");
    await loader({ request });

    const activeBoardsCall = mockPoolQuery.mock.calls[1];
    expect(activeBoardsCall[0]).toContain("archived_at IS NULL");
  });

  it("archived boards query includes only archived boards", async () => {
    const { loader } = await import("./dashboard");

    loginAs("user-1");
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // active boards
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // archived boards

    const request = new Request("http://localhost:3000/app/dashboard");
    await loader({ request });

    const archivedBoardsCall = mockPoolQuery.mock.calls[2];
    expect(archivedBoardsCall[0]).toContain("archived_at IS NOT NULL");
    expect(archivedBoardsCall[0]).toContain("b.title ASC");
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
    const result = await action({ request });

    expect(mockArchiveBoard).toHaveBeenCalledWith("board-1", "user-1");
    expect(result).toBeNull();
  });

  it("unarchives a board when intent is 'unarchive'", async () => {
    const { action } = await import("./dashboard");

    loginAs("user-1");
    mockUnarchiveBoard.mockResolvedValueOnce(undefined);

    const request = makeRequest("unarchive", "board-1");
    const result = await action({ request });

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
      await action({ request });
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(400);
    }
  });
});
