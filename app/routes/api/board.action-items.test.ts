import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBulkCreate = vi.fn();
vi.mock("~/server/action_item_model", () => ({
  bulkCreateBoardActionItems: (...args: unknown[]) => mockBulkCreate(...args),
}));

const mockUserCanFacilitate = vi.fn();
const mockGetBoardAccess = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  userCanFacilitate: (...args: unknown[]) => mockUserCanFacilitate(...args),
  getBoardAccess: (...args: unknown[]) => mockGetBoardAccess(...args),
}));

const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getApiUser: (...args: unknown[]) => mockGetApiUser(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ id: "agent-1", username: "Claude", teamId: "team-1" });
  mockUserCanFacilitate.mockResolvedValue(true);
  mockGetBoardAccess.mockResolvedValue({ exists: true, allowed: true, userIsRegistered: true });
  mockBulkCreate.mockResolvedValue({ id: "board-1", actionItems: [{ id: "a1" }] });
});

function req(body: unknown) {
  return new Request("http://localhost:3000/api/v1/boards/board-1/action-items", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer rk_live_x" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/boards/:id/action-items", () => {
  it("bulk creates items for a facilitating agent", async () => {
    const { action } = await import("./board.action-items");
    const res = (await action({
      request: req({ items: [{ text: "Ship the fix" }, { text: "  Write the doc " }] }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;

    expect(res.status).toBe(201);
    expect(mockBulkCreate).toHaveBeenCalledWith(
      "board-1",
      ["Ship the fix", "Write the doc"],
      "agent-1"
    );
  });

  it("401 when unauthenticated", async () => {
    const { action } = await import("./board.action-items");
    mockGetApiUser.mockResolvedValueOnce(null);
    const res = (await action({
      request: req({ items: [{ text: "x" }] }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(res.status).toBe(401);
    expect(mockBulkCreate).not.toHaveBeenCalled();
  });

  it("403 when the caller cannot facilitate the board", async () => {
    const { action } = await import("./board.action-items");
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    const res = (await action({
      request: req({ items: [{ text: "x" }] }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(res.status).toBe(403);
  });

  it("checks board access before checking facilitation (GAP-008)", async () => {
    const { action } = await import("./board.action-items");
    await action({
      request: req({ items: [{ text: "x" }] }),
      params: { id: "board-1" }, context: {},
    } as never);
    expect(mockGetBoardAccess).toHaveBeenCalledWith("board-1", "agent-1", "team-1");
  });

  it("403 for an out-of-crew key on a members-only board with open_facilitation on", async () => {
    const { action } = await import("./board.action-items");
    // The key can't facilitate via board access, but open_facilitation would
    // otherwise let userCanFacilitate say yes — getBoardAccess must gate first.
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: true });
    mockUserCanFacilitate.mockResolvedValueOnce(true);

    const res = (await action({
      request: req({ items: [{ text: "x" }] }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("This board is restricted to its crew");
    expect(mockBulkCreate).not.toHaveBeenCalled();
  });

  it("404 when the board does not exist", async () => {
    const { action } = await import("./board.action-items");
    mockGetBoardAccess.mockResolvedValueOnce({ exists: false, allowed: false, userIsRegistered: false });

    const res = (await action({
      request: req({ items: [{ text: "x" }] }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(res.status).toBe(404);
  });

  it("400 on empty items", async () => {
    const { action } = await import("./board.action-items");
    const res = (await action({
      request: req({ items: [] }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(res.status).toBe(400);
  });

  it("413 when over the cap", async () => {
    const { action } = await import("./board.action-items");
    const items = Array.from({ length: 101 }, (_, i) => ({ text: `item ${i}` }));
    const res = (await action({
      request: req({ items }),
      params: { id: "board-1" }, context: {},
    } as never)) as Response;
    expect(res.status).toBe(413);
  });

  it("rejects GET with 405", async () => {
    const { loader } = await import("./board.action-items");
    expect((loader() as Response).status).toBe(405);
  });
});
