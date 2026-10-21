import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetBoardServer = vi.fn();
const mockUpdateBoardTitle = vi.fn();
vi.mock("~/server/board_model", () => ({
  updateBoardTitleServer: (...args: unknown[]) => mockUpdateBoardTitle(...args),
}));
// GET reads the same snapshot as the browser's poll.
vi.mock("~/server/board_snapshot", () => ({
  getBoardSnapshot: (...args: unknown[]) => mockGetBoardServer(...args),
}));

const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getApiUser: (...args: unknown[]) => mockGetApiUser(...args),
}));

const mockGetBoardAccess = vi.fn();
const mockUserCanFacilitate = vi.fn();
const mockLockReason = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  getBoardAccess: (...args: unknown[]) => mockGetBoardAccess(...args),
  userCanFacilitate: (...args: unknown[]) => mockUserCanFacilitate(...args),
  lockReason: (...args: unknown[]) => mockLockReason(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: board exists and is openly accessible.
  mockGetBoardAccess.mockResolvedValue({ exists: true, allowed: true, userIsRegistered: true });
  mockUserCanFacilitate.mockResolvedValue(true);
  mockLockReason.mockResolvedValue(null);
});

describe("GET /api/v1/boards/:id", () => {
  it("returns the board as JSON with user_votes populated when authenticated (API-003)", async () => {
    const { loader } = await import("./board");

    mockGetApiUser.mockResolvedValueOnce({ id: "user-1" });
    mockGetBoardServer.mockResolvedValueOnce({
      id: "board-1",
      title: "Roadmap",
      readonly: false,
      isOwner: false,
      timerRunning: false,
      timerStartedAt: null,
      timerEndsAt: null,
      columns: [],
    });

    const response = (await loader({
      request: new Request("http://localhost:3000/api/v1/boards/board-1", {
        headers: { Authorization: "Bearer some-token" },
      }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string };
    expect(body.id).toBe("board-1");
    expect(mockGetBoardServer).toHaveBeenCalledWith("board-1", "user-1");
  });

  it("returns the board without user context when unauthenticated", async () => {
    const { loader } = await import("./board");

    mockGetApiUser.mockResolvedValueOnce(null);
    mockGetBoardServer.mockResolvedValueOnce({ id: "board-1", columns: [] });

    const response = (await loader({
      request: new Request("http://localhost:3000/api/v1/boards/board-1"),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(200);
    expect(mockGetBoardServer).toHaveBeenCalledWith("board-1", null);
  });

  it("returns 404 when the board does not exist", async () => {
    const { loader } = await import("./board");

    mockGetApiUser.mockResolvedValueOnce(null);
    mockGetBoardAccess.mockResolvedValueOnce({ exists: false, allowed: false, userIsRegistered: false });

    const response = (await loader({
      request: new Request("http://localhost:3000/api/v1/boards/missing"),
      params: { id: "missing" },
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockGetBoardServer).not.toHaveBeenCalled();
  });

  it("returns 403 when the board is restricted to its crew", async () => {
    const { loader } = await import("./board");

    mockGetApiUser.mockResolvedValueOnce({ id: "outsider" });
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: true });

    const response = (await loader({
      request: new Request("http://localhost:3000/api/v1/boards/board-1"),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(mockGetBoardServer).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/boards/:id (API-008)", () => {
  function patch(body: unknown, method = "PATCH") {
    return new Request("http://localhost:3000/api/v1/boards/board-1", {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer rk_live_x" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }
  async function run(request: Request) {
    const { action } = await import("./board");
    try {
      return (await action({ request, params: { id: "board-1" }, context: {} } as never)) as Response;
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
  }
  async function errorCode(res: Response) {
    return ((await res.json()) as { error: { code: string } }).error.code;
  }

  beforeEach(() => {
    mockGetApiUser.mockResolvedValue({ id: "agent-1", username: "Timekeeper", teamId: "team-a" });
    mockUpdateBoardTitle.mockResolvedValue({ id: "board-1", title: "Deprecated — moved" });
  });

  it("renames the board for a facilitator and returns it as the caller sees it", async () => {
    const res = await run(patch({ title: "  Deprecated — moved  " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "board-1", title: "Deprecated — moved" });
    expect(mockUpdateBoardTitle).toHaveBeenCalledWith("board-1", "Deprecated — moved", "agent-1");
    expect(mockGetBoardAccess).toHaveBeenCalledWith("board-1", "agent-1", "team-a");
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { board: true });
  });

  it("401 without credentials", async () => {
    mockGetApiUser.mockResolvedValueOnce(null);
    const res = await run(patch({ title: "x" }));
    expect(res.status).toBe(401);
    expect(mockUpdateBoardTitle).not.toHaveBeenCalled();
  });

  it("403 for a key from another crew on a members-only board, before facilitation is asked", async () => {
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: false });
    const res = await run(patch({ title: "x" }));
    expect(res.status).toBe(403);
    expect(mockUserCanFacilitate).not.toHaveBeenCalled();
  });

  it("403 when the caller cannot facilitate", async () => {
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    const res = await run(patch({ title: "x" }));
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("FORBIDDEN");
    expect(mockUpdateBoardTitle).not.toHaveBeenCalled();
  });

  it("423 when the board is locked", async () => {
    mockLockReason.mockResolvedValueOnce("Board is locked");
    const res = await run(patch({ title: "x" }));
    expect(res.status).toBe(423);
    expect(await errorCode(res)).toBe("LOCKED");
    expect(mockUpdateBoardTitle).not.toHaveBeenCalled();
  });

  it("404 for a missing board", async () => {
    mockGetBoardAccess.mockResolvedValueOnce({ exists: false, allowed: false, userIsRegistered: false });
    expect((await run(patch({ title: "x" }))).status).toBe(404);
  });

  it.each([
    [{}, "missing title"],
    [{ title: "   " }, "blank title"],
    [{ title: 5 }, "non-string title"],
    [{ title: "x".repeat(201) }, "title over 200 chars"],
    ["{nope", "malformed JSON"],
  ])("400 for %j (%s)", async (body, _reason) => {
    const res = await run(patch(body));
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("BAD_REQUEST");
    expect(mockUpdateBoardTitle).not.toHaveBeenCalled();
  });

  it("405 for other write methods", async () => {
    const res = await run(patch({ title: "x" }, "POST"));
    expect(res.status).toBe(405);
  });
});
