import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireBoardAccess = vi.fn();
const mockRequireFacilitator = vi.fn();
const mockRequireUnlocked = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireBoardAccess: (...args: unknown[]) => mockRequireBoardAccess(...args),
  requireFacilitator: (...args: unknown[]) => mockRequireFacilitator(...args),
  requireUnlocked: (...args: unknown[]) => mockRequireUnlocked(...args),
}));

const mockUpdateBoardTitle = vi.fn();
vi.mock("~/server/board_model", () => ({
  updateBoardTitleServer: (...args: unknown[]) => mockUpdateBoardTitle(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireBoardAccess.mockResolvedValue({ id: "user-1" });
  mockRequireFacilitator.mockResolvedValue({ id: "user-1" });
  mockRequireUnlocked.mockResolvedValue(undefined);
  mockUpdateBoardTitle.mockResolvedValue({ ok: true });
});

function patchRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/board/board-1/title", {
    method: "PATCH",
    body: form,
  });
}

describe("board.title action", () => {
  it("checks board access before updating the title", async () => {
    const { action } = await import("./board.title");
    await action({
      request: patchRequest({ title: "New Title" }),
      params: { id: "board-1" },
      context: {},
    } as never);

    expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.any(Request), "board-1");
    expect(mockUpdateBoardTitle).toHaveBeenCalledWith("board-1", "New Title");
  });

  it("requires facilitator status before updating the title (BRD-003)", async () => {
    const { action } = await import("./board.title");
    await action({
      request: patchRequest({ title: "New Title" }),
      params: { id: "board-1" },
      context: {},
    } as never);

    expect(mockRequireFacilitator).toHaveBeenCalledWith(expect.any(Request), "board-1");
  });

  it("propagates the access check's rejection and never updates the title", async () => {
    const { action } = await import("./board.title");
    mockRequireBoardAccess.mockRejectedValueOnce(
      new Response("This board is restricted to its crew", { status: 403 })
    );

    try {
      await action({
        request: patchRequest({ title: "New Title" }),
        params: { id: "board-1" },
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockUpdateBoardTitle).not.toHaveBeenCalled();
  });

  it("rejects a non-facilitator with 403 and never updates the title", async () => {
    const { action } = await import("./board.title");
    mockRequireFacilitator.mockRejectedValueOnce(
      new Response("Facilitator access required", { status: 403 })
    );

    try {
      await action({
        request: patchRequest({ title: "New Title" }),
        params: { id: "board-1" },
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockUpdateBoardTitle).not.toHaveBeenCalled();
  });

  it("propagates the 401 when there is no session at all", async () => {
    const { action } = await import("./board.title");
    mockRequireFacilitator.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));

    try {
      await action({
        request: patchRequest({ title: "New Title" }),
        params: { id: "board-1" },
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(401);
    }
    expect(mockUpdateBoardTitle).not.toHaveBeenCalled();
  });

  it("rejects a locked board with 423 and never updates the title", async () => {
    const { action } = await import("./board.title");
    mockRequireUnlocked.mockRejectedValueOnce(new Response("Board is locked", { status: 423 }));

    try {
      await action({
        request: patchRequest({ title: "New Title" }),
        params: { id: "board-1" },
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(423);
    }
    expect(mockUpdateBoardTitle).not.toHaveBeenCalled();
  });

  it("still rejects a missing title with 422 once access is granted", async () => {
    const { action } = await import("./board.title");
    try {
      await action({
        request: patchRequest({ title: "   " }),
        params: { id: "board-1" },
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(422);
    }
  });
});
