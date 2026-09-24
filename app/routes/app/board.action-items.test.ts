import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireFacilitator = vi.fn();
const mockRequireUnlocked = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireFacilitator: (...args: unknown[]) => mockRequireFacilitator(...args),
  requireUnlocked: (...args: unknown[]) => mockRequireUnlocked(...args),
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
  mockRequireUnlocked.mockResolvedValue(undefined);
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
    expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { board: true });
    expect(mockCreate).toHaveBeenCalledWith("board-1", "Ship the fix", "fac-1");
    expect(res.status).toBe(200);
  });

  // GAP-003 residual: action items are BRD-014 / DECK-023-025 — the client
  // already disables these controls when boardLocked; this closes the
  // server side. notes_locked does not apply (action items aren't notes).
  it("POST rejects a locked board with 423 and never creates the item", async () => {
    const { action } = await import("./board.action-items");
    mockRequireUnlocked.mockRejectedValueOnce(new Response("Board is locked", { status: 423 }));
    try {
      await action({
        request: formRequest("POST", { text: "Ship the fix" }),
        params: { id: "board-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(423);
    }
    expect(mockCreate).not.toHaveBeenCalled();
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
    expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { board: true });
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

  it("PATCH intent=complete rejects a locked board with 423 (BRD-014)", async () => {
    const { action } = await import("./board.action-items");
    mockRequireUnlocked.mockRejectedValueOnce(new Response("Board is locked", { status: 423 }));
    try {
      await action({
        request: formRequest("PATCH", { intent: "complete", itemId: "item-1", completed: "true" }),
        params: { id: "board-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(423);
    }
    expect(mockSetCompleted).not.toHaveBeenCalled();
  });

  it("PATCH intent=text requires facilitator", async () => {
    const { action } = await import("./board.action-items");
    await action({
      request: formRequest("PATCH", { intent: "text", itemId: "item-1", text: "Refined" }),
      params: { id: "board-1" }, context: {},
    } as never);
    expect(mockRequireFacilitator).toHaveBeenCalled();
    expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { board: true });
    expect(mockUpdateText).toHaveBeenCalledWith("board-1", "item-1", "Refined", "fac-1");
  });

  it("PATCH intent=text rejects a locked board with 423 (DECK-024)", async () => {
    const { action } = await import("./board.action-items");
    mockRequireUnlocked.mockRejectedValueOnce(new Response("Board is locked", { status: 423 }));
    try {
      await action({
        request: formRequest("PATCH", { intent: "text", itemId: "item-1", text: "Refined" }),
        params: { id: "board-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(423);
    }
    expect(mockUpdateText).not.toHaveBeenCalled();
  });

  it("DELETE requires facilitator and deletes", async () => {
    const { action } = await import("./board.action-items");
    await action({
      request: formRequest("DELETE", { itemId: "item-1" }),
      params: { id: "board-1" }, context: {},
    } as never);
    expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { board: true });
    expect(mockDelete).toHaveBeenCalledWith("board-1", "item-1", "fac-1");
  });

  it("DELETE rejects a locked board with 423 (DECK-025)", async () => {
    const { action } = await import("./board.action-items");
    mockRequireUnlocked.mockRejectedValueOnce(new Response("Board is locked", { status: 423 }));
    try {
      await action({
        request: formRequest("DELETE", { itemId: "item-1" }),
        params: { id: "board-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(423);
    }
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
