import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetBoardServer = vi.fn();
vi.mock("~/server/board_model", () => ({
  getBoardServer: (...args: unknown[]) => mockGetBoardServer(...args),
}));

const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getApiUser: (...args: unknown[]) => mockGetApiUser(...args),
}));

const mockGetBoardAccess = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  getBoardAccess: (...args: unknown[]) => mockGetBoardAccess(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Default: board exists and is openly accessible.
  mockGetBoardAccess.mockResolvedValue({ exists: true, allowed: true, userIsRegistered: true });
});

describe("GET /api/v1/boards/:id", () => {
  it("returns the board as JSON with user_votes populated when authenticated", async () => {
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
