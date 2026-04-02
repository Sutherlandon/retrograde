import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: vi.fn(async () => ({
      query: mockQuery,
      release: mockRelease,
    })),
  },
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("updateColumnPromptServer", () => {
  it("updates the prompt text for a column", async () => {
    const { updateColumnPromptServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({});
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await updateColumnPromptServer("board-1", "col-1", "Think about what went well");

    expect(mockPoolQuery.mock.calls[0][0]).toContain("UPDATE columns SET prompt");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["Think about what went well", "col-1"]);
  });

  it("allows clearing the prompt to an empty string", async () => {
    const { updateColumnPromptServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({});
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await updateColumnPromptServer("board-1", "col-1", "");

    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["", "col-1"]);
  });
});

describe("duplicateBoardServer", () => {
  it("creates a new board with '(copy)' suffix and copies columns", async () => {
    const { duplicateBoardServer } = await import("./board_model");

    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // SELECT title + voting settings
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ title: "Sprint 1", voting_enabled: true, voting_allowed: 3 }],
    });
    // INSERT board
    mockQuery.mockResolvedValueOnce({});
    // INSERT board_member
    mockQuery.mockResolvedValueOnce({});
    // SELECT columns
    mockQuery.mockResolvedValueOnce({
      rows: [
        { title: "Good", col_order: 0 },
        { title: "Bad", col_order: 1 },
        { title: "Actions", col_order: 2 },
      ],
    });
    // 3x INSERT column
    mockQuery.mockResolvedValueOnce({});
    mockQuery.mockResolvedValueOnce({});
    mockQuery.mockResolvedValueOnce({});
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const newId = await duplicateBoardServer("board-1", "user-1");

    expect(typeof newId).toBe("string");
    expect(newId).toHaveLength(36); // UUID format

    // Verify board title includes "(copy)"
    const insertBoardCall = mockQuery.mock.calls[2];
    expect(insertBoardCall[0]).toContain("INSERT INTO boards");
    expect(insertBoardCall[1][1]).toBe("Sprint 1 (copy)");

    // Verify voting settings were copied
    expect(insertBoardCall[1][3]).toBe(true);  // voting_enabled
    expect(insertBoardCall[1][4]).toBe(3);     // voting_allowed

    // Verify owner membership
    const insertMemberCall = mockQuery.mock.calls[3];
    expect(insertMemberCall[0]).toContain("INSERT INTO board_members");
    expect(insertMemberCall[0]).toContain("owner");
    expect(insertMemberCall[1][1]).toBe("user-1");

    // Verify 3 columns were copied
    const colInserts = mockQuery.mock.calls.slice(5, 8);
    expect(colInserts[0][1][2]).toBe("Good");
    expect(colInserts[1][1][2]).toBe("Bad");
    expect(colInserts[2][1][2]).toBe("Actions");

    // Verify transaction committed
    expect(mockQuery.mock.calls[8][0]).toBe("COMMIT");

    // Verify client was released
    expect(mockRelease).toHaveBeenCalled();
  });

  it("throws and rolls back when board is not found", async () => {
    const { duplicateBoardServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // SELECT title - not found
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(duplicateBoardServer("bad-id", "user-1")).rejects.toThrow("Board not found");
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("updateBoardSettingsServer", () => {
  it("enables voting with a specified allowed vote count", async () => {
    const { updateBoardSettingsServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({}); // UPDATE boards
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] }); // getBoardServer

    await updateBoardSettingsServer("board-1", true, 3);

    expect(mockPoolQuery.mock.calls[0][0]).toContain("UPDATE boards");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("voting_enabled");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("voting_allowed");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([true, 3, "board-1"]);
  });

  it("disables voting", async () => {
    const { updateBoardSettingsServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({});
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await updateBoardSettingsServer("board-1", false, 5);

    expect(mockPoolQuery.mock.calls[0][1]).toEqual([false, 5, "board-1"]);
  });
});

describe("clearBoardVotesServer", () => {
  it("clears all likes and votes for every note on the board", async () => {
    const { clearBoardVotesServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({}); // DELETE note_votes
    mockPoolQuery.mockResolvedValueOnce({}); // UPDATE notes SET likes = 0

    await clearBoardVotesServer("board-1");

    expect(mockPoolQuery.mock.calls[0][0]).toContain("DELETE FROM note_votes");
    expect(mockPoolQuery.mock.calls[1][0]).toContain("UPDATE notes SET likes = 0");
  });
});

describe("voteNoteServer", () => {
  it("inserts a vote row when the user has not yet voted on the note", async () => {
    const { voteNoteServer } = await import("./board_model");

    // INSERT vote (ON CONFLICT DO NOTHING returns rowCount 1)
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });
    // getBoardServer
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await voteNoteServer("board-1", "note-1", "user-1");

    expect(mockPoolQuery.mock.calls[0][0]).toContain("INSERT INTO note_votes");
    expect(mockPoolQuery.mock.calls[0][1]).toContain("note-1");
    expect(mockPoolQuery.mock.calls[0][1]).toContain("user-1");
  });

  it("removes the vote row when the user has already voted on the note", async () => {
    const { voteNoteServer } = await import("./board_model");

    // INSERT returns rowCount 0 (conflict — vote already exists)
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });
    // DELETE
    mockPoolQuery.mockResolvedValueOnce({});
    // getBoardServer
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await voteNoteServer("board-1", "note-1", "user-1");

    expect(mockPoolQuery.mock.calls[1][0]).toContain("DELETE FROM note_votes");
    expect(mockPoolQuery.mock.calls[1][1]).toEqual(["note-1", "user-1"]);
  });
});

describe("deleteBoardServer", () => {
  it("deletes board and all related data when user is owner", async () => {
    const { deleteBoardServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ role: "owner" }] }); // SELECT role
    mockQuery.mockResolvedValueOnce({}); // DELETE notes
    mockQuery.mockResolvedValueOnce({}); // DELETE columns
    mockQuery.mockResolvedValueOnce({}); // DELETE board_members
    mockQuery.mockResolvedValueOnce({}); // DELETE board
    mockQuery.mockResolvedValueOnce({}); // COMMIT

    await deleteBoardServer("board-1", "user-1");

    // Verify ownership check
    const roleCheck = mockQuery.mock.calls[1];
    expect(roleCheck[0]).toContain("board_members");
    expect(roleCheck[1]).toEqual(["board-1", "user-1"]);

    // Verify deletions happened in order
    expect(mockQuery.mock.calls[2][0]).toContain("DELETE FROM notes");
    expect(mockQuery.mock.calls[3][0]).toContain("DELETE FROM columns");
    expect(mockQuery.mock.calls[4][0]).toContain("DELETE FROM board_members");
    expect(mockQuery.mock.calls[5][0]).toContain("DELETE FROM boards");
    expect(mockQuery.mock.calls[6][0]).toBe("COMMIT");

    expect(mockRelease).toHaveBeenCalled();
  });

  it("throws and rolls back when user is not the owner", async () => {
    const { deleteBoardServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ role: "member" }] }); // not owner
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(deleteBoardServer("board-1", "user-2")).rejects.toThrow(
      "Only the board owner can delete a board"
    );
    expect(mockRelease).toHaveBeenCalled();
  });

  it("throws and rolls back when user is not a member at all", async () => {
    const { deleteBoardServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // no membership
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(deleteBoardServer("board-1", "stranger")).rejects.toThrow(
      "Only the board owner can delete a board"
    );
    expect(mockRelease).toHaveBeenCalled();
  });
});
