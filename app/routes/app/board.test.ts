import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

const mockRequireBoardAccess = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireBoardAccess: (...args: unknown[]) => mockRequireBoardAccess(...args),
}));

const mockGetBoardServer = vi.fn();
const mockStopTimerServer = vi.fn();
vi.mock("~/server/board_model", () => ({
  getBoardServer: (...args: unknown[]) => mockGetBoardServer(...args),
  stopTimerServer: (...args: unknown[]) => mockStopTimerServer(...args),
}));

const mockGetAttachmentsServer = vi.fn();
vi.mock("~/server/attachment_model", () => ({
  getAttachmentsServer: (...args: unknown[]) => mockGetAttachmentsServer(...args),
}));

const mockGetOptionalUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getOptionalUser: (...args: unknown[]) => mockGetOptionalUser(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockRequireBoardAccess.mockResolvedValue(undefined);
  mockGetOptionalUser.mockResolvedValue(null);
  mockGetAttachmentsServer.mockResolvedValue([]);
});

describe("board.tsx loader", () => {
  it("returns the tutorial example fixture without querying the DB [BRD-017]", async () => {
    const { loader } = await import("./board");
    const { exampleBoardTutorial } = await import("~/example-data/example_board_tutorial");

    const request = new Request("http://localhost:3000/app/board/example-board");
    const result = await loader({ request, params: { id: "example-board" }, context: {} } as never);

    expect(result).toEqual(exampleBoardTutorial);
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockRequireBoardAccess).not.toHaveBeenCalled();
    expect(mockGetBoardServer).not.toHaveBeenCalled();
    expect(mockGetAttachmentsServer).not.toHaveBeenCalled();
  });

  it("returns the real-world example fixture without querying the DB [BRD-017]", async () => {
    const { loader } = await import("./board");
    const { exampleBoardRealWorld } = await import("~/example-data/real_ai_example");

    const request = new Request("http://localhost:3000/app/board/example-board-real-world");
    const result = await loader({
      request,
      params: { id: "example-board-real-world" },
      context: {},
    } as never);

    expect(result).toEqual(exampleBoardRealWorld);
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockRequireBoardAccess).not.toHaveBeenCalled();
    expect(mockGetBoardServer).not.toHaveBeenCalled();
    expect(mockGetAttachmentsServer).not.toHaveBeenCalled();
  });

  it("still hits the DB path for a real (non-example) board id [BRD-017]", async () => {
    const { loader } = await import("./board");
    mockGetBoardServer.mockResolvedValueOnce({
      id: "real-board-1",
      timerRunning: false,
      timerEndsAt: null,
    });

    const request = new Request("http://localhost:3000/app/board/real-board-1");
    const result = await loader({ request, params: { id: "real-board-1" }, context: {} } as never);

    expect(mockRequireBoardAccess).toHaveBeenCalledWith(request, "real-board-1", {
      loginRedirect: true,
    });
    expect(mockGetBoardServer).toHaveBeenCalledWith("real-board-1", undefined);
    expect((result as { id: string }).id).toBe("real-board-1");
  });
});
