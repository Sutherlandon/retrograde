import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: vi.fn(async () => ({
      query: mockClientQuery,
      release: mockRelease,
    })),
  },
}));
vi.mock("~/server/db_init", () => ({}));

const mockGetBoardServer = vi.fn();
vi.mock("~/server/board_model", () => ({
  getBoardServer: (...args: unknown[]) => mockGetBoardServer(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockGetBoardServer.mockResolvedValue({ id: "board-1", columns: [], actionItems: [] });
});

describe("createBoardActionItem", () => {
  it("inserts with next item_order and returns the refreshed board", async () => {
    const { createBoardActionItem } = await import("./action_item_model");
    const board = await createBoardActionItem("board-1", "Follow up with infra", "user-1");

    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("INSERT INTO action_items");
    expect(call[0]).toContain("MAX(item_order) + 1");
    expect(call[1]).toEqual(["board-1", "Follow up with infra", "user-1"]);
    expect(mockGetBoardServer).toHaveBeenCalledWith("board-1", "user-1");
    expect(board).toBeTruthy();
  });
});

describe("bulkCreateBoardActionItems", () => {
  it("inserts sequentially ordered items in a transaction", async () => {
    const { bulkCreateBoardActionItems } = await import("./action_item_model");
    mockClientQuery.mockResolvedValueOnce({}); // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [{ next: 2 }] }); // MAX+1
    mockClientQuery.mockResolvedValueOnce({}); // insert 1
    mockClientQuery.mockResolvedValueOnce({}); // insert 2
    mockClientQuery.mockResolvedValueOnce({}); // COMMIT

    await bulkCreateBoardActionItems("board-1", ["a", "b"], "agent-1");

    const inserts = mockClientQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO action_items")
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0][1]).toEqual(["board-1", "a", "agent-1", 2]);
    expect(inserts[1][1]).toEqual(["board-1", "b", "agent-1", 3]);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("rolls back on failure", async () => {
    const { bulkCreateBoardActionItems } = await import("./action_item_model");
    mockClientQuery.mockResolvedValueOnce({}); // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [{ next: 0 }] });
    mockClientQuery.mockRejectedValueOnce(new Error("boom"));
    mockClientQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      bulkCreateBoardActionItems("board-1", ["x"], null)
    ).rejects.toThrow("boom");
    expect(mockClientQuery.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
  });
});

describe("setActionItemCompleted", () => {
  it("sets completed and stamps completed_at, scoped to the board", async () => {
    const { setActionItemCompleted } = await import("./action_item_model");
    await setActionItemCompleted("board-1", "item-1", true, "user-1");
    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("UPDATE action_items");
    expect(call[0]).toContain("completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END");
    expect(call[0]).toContain("board_id = $3");
    expect(call[1]).toEqual([true, "item-1", "board-1"]);
  });
});

describe("updateActionItemText / deleteActionItemServer", () => {
  it("updates text scoped to board", async () => {
    const { updateActionItemText } = await import("./action_item_model");
    await updateActionItemText("board-1", "item-1", "new text", null);
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["new text", "item-1", "board-1"]);
  });

  it("deletes scoped to board", async () => {
    const { deleteActionItemServer } = await import("./action_item_model");
    await deleteActionItemServer("board-1", "item-1", null);
    expect(mockPoolQuery.mock.calls[0][0]).toContain("DELETE FROM action_items");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["item-1", "board-1"]);
  });
});

describe("team-level items", () => {
  it("creates a team item with next order", async () => {
    const { createTeamActionItem } = await import("./action_item_model");
    await createTeamActionItem("team-1", "Team objective", "user-1");
    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("INSERT INTO action_items");
    expect(call[0]).toContain("team_id");
    expect(call[1]).toEqual(["team-1", "Team objective", "user-1"]);
  });

  it("toggles a team item scoped to team", async () => {
    const { setTeamActionItemCompleted } = await import("./action_item_model");
    await setTeamActionItemCompleted("team-1", "item-9", true);
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([true, "item-9", "team-1"]);
  });

  it("lists rollup items joined with board titles", async () => {
    const { listTeamBoardActionItems } = await import("./action_item_model");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "1", text: "x", completed: false, board_title: "Sprint 12" }],
    });
    const rows = await listTeamBoardActionItems("team-1");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("JOIN boards b ON b.id = ai.board_id");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("NOT ai.completed");
    expect(rows[0].board_title).toBe("Sprint 12");
  });
});
