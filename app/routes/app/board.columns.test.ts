import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireBoardAccess = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireBoardAccess: (...args: unknown[]) => mockRequireBoardAccess(...args),
}));

const mockGetOptionalUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getOptionalUser: (...args: unknown[]) => mockGetOptionalUser(...args),
}));

const mockAddColumn = vi.fn();
const mockUpdateColumnTitle = vi.fn();
const mockUpdateColumnPrompt = vi.fn();
const mockDeleteColumn = vi.fn();
vi.mock("~/server/board_model", () => ({
  addColumnServer: (...args: unknown[]) => mockAddColumn(...args),
  updateColumnTitleServer: (...args: unknown[]) => mockUpdateColumnTitle(...args),
  updateColumnPromptServer: (...args: unknown[]) => mockUpdateColumnPrompt(...args),
  deleteColumnServer: (...args: unknown[]) => mockDeleteColumn(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireBoardAccess.mockResolvedValue({ id: "user-1" });
  mockGetOptionalUser.mockResolvedValue({ id: "viewer-1" });
  const board = { id: "board-1", columns: [] };
  mockAddColumn.mockResolvedValue(board);
  mockUpdateColumnTitle.mockResolvedValue(board);
  mockUpdateColumnPrompt.mockResolvedValue(board);
  mockDeleteColumn.mockResolvedValue(board);
});

function request(method: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/board/board-1/columns", { method, body: form });
}

describe("board.columns action", () => {
  it("checks board access before adding a column", async () => {
    const { action } = await import("./board.columns");
    await action({
      request: request("POST", { id: "col-1", title: "To Do", col_order: "0" }),
      params: { id: "board-1" },
      context: {},
    } as never);

    expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.any(Request), "board-1");
    expect(mockAddColumn).toHaveBeenCalled();
  });

  it("checks board access before updating a column title", async () => {
    const { action } = await import("./board.columns");
    await action({
      request: request("PATCH", { columnId: "col-1", title: "Renamed" }),
      params: { id: "board-1" },
      context: {},
    } as never);
    expect(mockRequireBoardAccess).toHaveBeenCalled();
    expect(mockUpdateColumnTitle).toHaveBeenCalled();
  });

  it("checks board access before deleting a column", async () => {
    const { action } = await import("./board.columns");
    await action({
      request: request("DELETE", { columnId: "col-1" }),
      params: { id: "board-1" },
      context: {},
    } as never);
    expect(mockRequireBoardAccess).toHaveBeenCalled();
    expect(mockDeleteColumn).toHaveBeenCalled();
  });

  it("propagates the access check's rejection and never mutates columns", async () => {
    const { action } = await import("./board.columns");
    mockRequireBoardAccess.mockRejectedValueOnce(
      new Response("This board is restricted to its crew", { status: 403 })
    );

    try {
      await action({
        request: request("POST", { id: "col-1", title: "To Do", col_order: "0" }),
        params: { id: "board-1" },
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockAddColumn).not.toHaveBeenCalled();
  });
});
