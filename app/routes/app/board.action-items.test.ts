import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireFacilitator = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireFacilitator: (...args: unknown[]) => mockRequireFacilitator(...args),
}));

const mockGetOptionalUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getOptionalUser: (...args: unknown[]) => mockGetOptionalUser(...args),
}));

const mockCreate = vi.fn();
const mockUpdateText = vi.fn();
const mockSetCompleted = vi.fn();
const mockDelete = vi.fn();
vi.mock("~/server/action_item_model", () => ({
  createBoardActionItem: (...args: unknown[]) => mockCreate(...args),
  updateActionItemText: (...args: unknown[]) => mockUpdateText(...args),
  setActionItemCompleted: (...args: unknown[]) => mockSetCompleted(...args),
  deleteActionItemServer: (...args: unknown[]) => mockDelete(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireFacilitator.mockResolvedValue({ id: "fac-1", username: "landon" });
  mockGetOptionalUser.mockResolvedValue({ id: "participant-1", username: "sam" });
  const board = { id: "board-1", actionItems: [] };
  mockCreate.mockResolvedValue(board);
  mockUpdateText.mockResolvedValue(board);
  mockSetCompleted.mockResolvedValue(board);
  mockDelete.mockResolvedValue(board);
});

function formRequest(method: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/board/board-1/action-items", {
    method,
    body: form,
  });
}

describe("board.action-items action", () => {
  it("POST creates an item as facilitator", async () => {
    const { action } = await import("./board.action-items");
    const res = (await action({
      request: formRequest("POST", { text: "Ship the fix" }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(mockRequireFacilitator).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledWith("board-1", "Ship the fix", "fac-1");
    expect(res.status).toBe(200);
  });

  it("POST rejects empty text", async () => {
    const { action } = await import("./board.action-items");
    try {
      await action({
        request: formRequest("POST", { text: "   " }),
        params: { id: "board-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(422);
    }
  });

  it("PATCH intent=complete allows any session user (no facilitator check)", async () => {
    const { action } = await import("./board.action-items");
    await action({
      request: formRequest("PATCH", { intent: "complete", itemId: "item-1", completed: "true" }),
      params: { id: "board-1" }, context: {},
    } as never);
    expect(mockRequireFacilitator).not.toHaveBeenCalled();
    expect(mockSetCompleted).toHaveBeenCalledWith("board-1", "item-1", true, "participant-1");
  });

  it("PATCH intent=complete rejects sessionless callers with 401", async () => {
    const { action } = await import("./board.action-items");
    mockGetOptionalUser.mockResolvedValueOnce(null);
    try {
      await action({
        request: formRequest("PATCH", { intent: "complete", itemId: "item-1", completed: "true" }),
        params: { id: "board-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(401);
    }
  });

  it("PATCH intent=text requires facilitator", async () => {
    const { action } = await import("./board.action-items");
    await action({
      request: formRequest("PATCH", { intent: "text", itemId: "item-1", text: "Refined" }),
      params: { id: "board-1" }, context: {},
    } as never);
    expect(mockRequireFacilitator).toHaveBeenCalled();
    expect(mockUpdateText).toHaveBeenCalledWith("board-1", "item-1", "Refined", "fac-1");
  });

  it("DELETE requires facilitator and deletes", async () => {
    const { action } = await import("./board.action-items");
    await action({
      request: formRequest("DELETE", { itemId: "item-1" }),
      params: { id: "board-1" }, context: {},
    } as never);
    expect(mockDelete).toHaveBeenCalledWith("board-1", "item-1", "fac-1");
  });
});
