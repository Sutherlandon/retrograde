import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    connect: vi.fn(async () => ({
      query: mockQuery,
      release: mockRelease,
    })),
  },
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("duplicateBoardServer", () => {
  it("creates a new board with '(copy)' suffix and copies columns", async () => {
    const { duplicateBoardServer } = await import("./board_model");

    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // SELECT title
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ title: "Sprint 1" }] });
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
