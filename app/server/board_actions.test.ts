import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDuplicate = vi.fn();
const mockDelete = vi.fn();
const mockArchive = vi.fn();
const mockUnarchive = vi.fn();
const mockMove = vi.fn();
const mockBulkDelete = vi.fn();

vi.mock("./board_model", () => ({
  duplicateBoardServer: (...a: unknown[]) => mockDuplicate(...a),
  deleteBoardServer: (...a: unknown[]) => mockDelete(...a),
  archiveBoardServer: (...a: unknown[]) => mockArchive(...a),
  unarchiveBoardServer: (...a: unknown[]) => mockUnarchive(...a),
  moveBoardsToTeamServer: (...a: unknown[]) => mockMove(...a),
  bulkDeleteBoardsServer: (...a: unknown[]) => mockBulkDelete(...a),
}));

vi.mock("~/server/db_init", () => ({}));

import { handleBoardMutation } from "./board_actions";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe("handleBoardMutation", () => {
  it("returns { handled: false } for a non-board intent", async () => {
    const res = await handleBoardMutation("addItem", form({}), "user-1");
    expect(res).toEqual({ handled: false });
    expect(mockDuplicate).not.toHaveBeenCalled();
  });

  it("duplicate redirects to the new board", async () => {
    mockDuplicate.mockResolvedValueOnce("board-new");
    const res = await handleBoardMutation("duplicate", form({ boardId: "b1" }), "user-1");
    expect(mockDuplicate).toHaveBeenCalledWith("b1", "user-1");
    expect(res.handled).toBe(true);
    const response = (res as { handled: true; result: Response }).result;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/app/board/board-new");
  });

  it("delete returns null (stays put) rather than redirecting", async () => {
    const res = await handleBoardMutation("delete", form({ boardId: "b1" }), "user-1");
    expect(mockDelete).toHaveBeenCalledWith("b1", "user-1");
    expect(res).toEqual({ handled: true, result: null });
  });

  it("archive / unarchive return null", async () => {
    expect(await handleBoardMutation("archive", form({ boardId: "b1" }), "user-1")).toEqual({ handled: true, result: null });
    expect(mockArchive).toHaveBeenCalledWith("b1", "user-1");
    expect(await handleBoardMutation("unarchive", form({ boardId: "b1" }), "user-1")).toEqual({ handled: true, result: null });
    expect(mockUnarchive).toHaveBeenCalledWith("b1", "user-1");
  });

  it("moveBoard maps 'none' to null and reports moved count", async () => {
    mockMove.mockResolvedValueOnce(["b1"]);
    const res = await handleBoardMutation("moveBoard", form({ boardId: "b1", teamId: "none" }), "user-1");
    expect(mockMove).toHaveBeenCalledWith(["b1"], null, "user-1");
    expect(res).toEqual({ handled: true, result: { moved: 1 } });
  });

  it("moveBoard to a real crew passes the crew id", async () => {
    mockMove.mockResolvedValueOnce(["b1"]);
    await handleBoardMutation("moveBoard", form({ boardId: "b1", teamId: "t9" }), "user-1");
    expect(mockMove).toHaveBeenCalledWith(["b1"], "t9", "user-1");
  });

  it("bulkMove splits ids and reports moved count", async () => {
    mockMove.mockResolvedValueOnce(["b1", "b2"]);
    const res = await handleBoardMutation("bulkMove", form({ boardIds: "b1,b2,b3", teamId: "t9" }), "user-1");
    expect(mockMove).toHaveBeenCalledWith(["b1", "b2", "b3"], "t9", "user-1");
    expect(res).toEqual({ handled: true, result: { moved: 2 } });
  });

  it("bulkDelete splits ids and reports deleted count", async () => {
    mockBulkDelete.mockResolvedValueOnce(["b1", "b2"]);
    const res = await handleBoardMutation("bulkDelete", form({ boardIds: "b1,b2" }), "user-1");
    expect(mockBulkDelete).toHaveBeenCalledWith(["b1", "b2"], "user-1");
    expect(res).toEqual({ handled: true, result: { deleted: 2 } });
  });

  it("throws 400 when boardId is missing", async () => {
    await expect(handleBoardMutation("archive", form({}), "user-1")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when bulk intents have no ids", async () => {
    await expect(handleBoardMutation("bulkDelete", form({ boardIds: "" }), "user-1")).rejects.toMatchObject({ status: 400 });
    await expect(handleBoardMutation("bulkMove", form({ boardIds: "", teamId: "t9" }), "user-1")).rejects.toMatchObject({ status: 400 });
  });
});
