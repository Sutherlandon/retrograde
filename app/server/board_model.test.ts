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
      rows: [{ title: "Sprint 1", voting_enabled: true, voting_allowed: 3, voting_scope: "column" }],
    });
    // INSERT board
    mockQuery.mockResolvedValueOnce({});
    // INSERT board_member
    mockQuery.mockResolvedValueOnce({});
    // SELECT columns
    mockQuery.mockResolvedValueOnce({
      rows: [
        { title: "Good", col_order: 0, prompt: "What went well?" },
        { title: "Bad", col_order: 1, prompt: "" },
        { title: "Actions", col_order: 2, prompt: "What will we change?" },
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
    expect(insertBoardCall[1][3]).toBe(true);     // voting_enabled
    expect(insertBoardCall[1][4]).toBe(3);        // voting_allowed
    expect(insertBoardCall[1][5]).toBe("column"); // voting_scope

    // Verify owner membership
    const insertMemberCall = mockQuery.mock.calls[3];
    expect(insertMemberCall[0]).toContain("INSERT INTO board_members");
    expect(insertMemberCall[0]).toContain("owner");
    expect(insertMemberCall[1][1]).toBe("user-1");

    // Verify 3 columns were copied with titles and prompts
    const colInserts = mockQuery.mock.calls.slice(5, 8);
    expect(colInserts[0][1][2]).toBe("Good");
    expect(colInserts[0][1][4]).toBe("What went well?");  // prompt
    expect(colInserts[1][1][2]).toBe("Bad");
    expect(colInserts[1][1][4]).toBe("");                 // prompt (empty)
    expect(colInserts[2][1][2]).toBe("Actions");
    expect(colInserts[2][1][4]).toBe("What will we change?"); // prompt

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

    await updateBoardSettingsServer("board-1", { votingEnabled: true, votingAllowed: 3, votingScope: "board", notesLocked: false, boardLocked: false, attributionEnabled: false });

    expect(mockPoolQuery.mock.calls[0][0]).toContain("UPDATE boards");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("voting_enabled");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("voting_allowed");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("voting_scope");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("notes_locked");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("board_locked");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([true, 3, "board", false, false, false, true, false, "board-1"]);
  });

  it("disables voting", async () => {
    const { updateBoardSettingsServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({});
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await updateBoardSettingsServer("board-1", { votingEnabled: false, votingAllowed: 5, votingScope: "board", notesLocked: false, boardLocked: false, attributionEnabled: false });

    expect(mockPoolQuery.mock.calls[0][1]).toEqual([false, 5, "board", false, false, false, true, false, "board-1"]);
  });

  it("enables notes lock to prevent note editing during voting", async () => {
    const { updateBoardSettingsServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({});
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await updateBoardSettingsServer("board-1", { votingEnabled: true, votingAllowed: 5, votingScope: "board", notesLocked: true, boardLocked: false, attributionEnabled: false });

    expect(mockPoolQuery.mock.calls[0][1]).toEqual([true, 5, "board", true, false, false, true, false, "board-1"]);
  });

  it("enables full board lock to prevent all modifications", async () => {
    const { updateBoardSettingsServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({});
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await updateBoardSettingsServer("board-1", { votingEnabled: false, votingAllowed: 5, votingScope: "board", notesLocked: false, boardLocked: true, attributionEnabled: false });

    expect(mockPoolQuery.mock.calls[0][1]).toEqual([false, 5, "board", false, true, false, true, false, "board-1"]);
  });

  it("persists hide_others_notes and scopes the returned board to the viewer", async () => {
    const { updateBoardSettingsServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({}); // UPDATE boards
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] }); // getBoardServer

    await updateBoardSettingsServer(
      "board-1",
      { votingEnabled: false, votingAllowed: 5, votingScope: "board", notesLocked: false, boardLocked: false, attributionEnabled: false, actionItemsVisible: true, hideOthersNotes: true },
      "viewer-1"
    );

    expect(mockPoolQuery.mock.calls[0][0]).toContain("hide_others_notes");
    // hideOthersNotes true lands in the $8 slot, before the board id.
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([false, 5, "board", false, false, false, true, true, "board-1"]);
    // The returned board is fetched scoped to the acting viewer (blind mode).
    expect(mockPoolQuery.mock.calls[1][1]).toEqual(["board-1", "viewer-1"]);
  });
});

describe("getBoardServer — blind brainstorm filtering", () => {
  it("emits a per-viewer notes filter gated on hide_others_notes", async () => {
    const { getBoardServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await getBoardServer("board-1", "viewer-1");

    const sql = mockPoolQuery.mock.calls[0][0] as string;
    // Notes are excluded unless blind mode is off OR the viewer authored them.
    expect(sql).toContain("NOT b.hide_others_notes OR n.created_by = $2::uuid");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["board-1", "viewer-1"]);
  });
});

describe("moveBoardsToTeamServer", () => {
  it("moves owned boards to a team the user belongs to and returns moved ids", async () => {
    const { moveBoardsToTeamServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: "board-1" }, { id: "board-2" }],
      rowCount: 2,
    });

    const moved = await moveBoardsToTeamServer(["board-1", "board-2"], "team-9", "user-1");

    expect(moved).toEqual(["board-1", "board-2"]);
    const [sql, params] = mockPoolQuery.mock.calls[0];
    expect(sql).toContain("UPDATE boards");
    expect(sql).toContain("board_members");
    expect(sql).toContain("team_members");
    expect(params).toEqual([["board-1", "board-2"], "team-9", "user-1"]);
  });

  it("moves a board to no team (unassigned) with a null teamId", async () => {
    const { moveBoardsToTeamServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: "board-1" }], rowCount: 1 });

    const moved = await moveBoardsToTeamServer(["board-1"], null, "user-1");

    expect(moved).toEqual(["board-1"]);
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([["board-1"], null, "user-1"]);
  });

  it("returns only the boards that were actually moved (ownership enforced in SQL)", async () => {
    const { moveBoardsToTeamServer } = await import("./board_model");

    // Only board-1 passes the ownership/membership guards
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: "board-1" }], rowCount: 1 });

    const moved = await moveBoardsToTeamServer(["board-1", "board-x"], "team-9", "user-1");
    expect(moved).toEqual(["board-1"]);
  });

  it("returns an empty array without querying when given no ids", async () => {
    const { moveBoardsToTeamServer } = await import("./board_model");
    const moved = await moveBoardsToTeamServer([], "team-9", "user-1");
    expect(moved).toEqual([]);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });
});

describe("countUnassignedBoardsForUser", () => {
  it("counts active teamless boards the user owns", async () => {
    const { countUnassignedBoardsForUser } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: 3 }], rowCount: 1 });

    const count = await countUnassignedBoardsForUser("user-1");

    expect(count).toBe(3);
    const [sql, params] = mockPoolQuery.mock.calls[0];
    expect(sql).toContain("team_id IS NULL");
    expect(sql).toContain("archived_at IS NULL");
    expect(sql).toContain("board_members");
    expect(params).toEqual(["user-1"]);
  });
});

describe("bulkDeleteBoardsServer", () => {
  it("deletes only owned boards (notes, columns, members, board) in one transaction", async () => {
    const { bulkDeleteBoardsServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "board-1" }, { id: "board-2" }], rowCount: 2 }); // owned ids
    mockQuery.mockResolvedValueOnce({}); // DELETE notes
    mockQuery.mockResolvedValueOnce({}); // DELETE columns
    mockQuery.mockResolvedValueOnce({}); // DELETE board_members
    mockQuery.mockResolvedValueOnce({}); // DELETE boards
    mockQuery.mockResolvedValueOnce({}); // COMMIT

    const deleted = await bulkDeleteBoardsServer(["board-1", "board-2", "board-x"], "user-1");

    expect(deleted).toEqual(["board-1", "board-2"]);
    expect(mockQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(mockQuery.mock.calls[1][0]).toContain("board_members");
    expect(mockQuery.mock.calls[1][1]).toEqual([["board-1", "board-2", "board-x"], "user-1"]);
    expect(mockQuery.mock.calls[6][0]).toBe("COMMIT");
    expect(mockRelease).toHaveBeenCalled();
  });

  it("commits without deleting when the user owns none of the boards", async () => {
    const { bulkDeleteBoardsServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // owned ids — none
    mockQuery.mockResolvedValueOnce({}); // COMMIT

    const deleted = await bulkDeleteBoardsServer(["board-x"], "user-1");

    expect(deleted).toEqual([]);
    // No delete statements between the ownership check and COMMIT
    expect(mockQuery.mock.calls[2][0]).toBe("COMMIT");
  });

  it("rolls back on failure", async () => {
    const { bulkDeleteBoardsServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "board-1" }], rowCount: 1 });
    mockQuery.mockRejectedValueOnce(new Error("db down")); // DELETE notes fails
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(bulkDeleteBoardsServer(["board-1"], "user-1")).rejects.toThrow("db down");
    expect(mockQuery.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mockRelease).toHaveBeenCalled();
  });

  it("returns an empty array without touching the db when given no ids", async () => {
    const { bulkDeleteBoardsServer } = await import("./board_model");
    const deleted = await bulkDeleteBoardsServer([], "user-1");
    expect(deleted).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("clearBoardVotesServer", () => {
  it("clears all likes and votes for every note on the board", async () => {
    const { clearBoardVotesServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({}); // DELETE note_votes
    mockPoolQuery.mockResolvedValueOnce({}); // DELETE note_likes
    mockPoolQuery.mockResolvedValueOnce({}); // UPDATE notes SET likes = 0

    await clearBoardVotesServer("board-1");

    expect(mockPoolQuery.mock.calls[0][0]).toContain("DELETE FROM note_votes");
    expect(mockPoolQuery.mock.calls[1][0]).toContain("DELETE FROM note_likes");
    expect(mockPoolQuery.mock.calls[2][0]).toContain("UPDATE notes SET likes = 0");
  });
});

describe("voteNoteServer", () => {
  it("upserts a vote row with count when delta is positive", async () => {
    const { voteNoteServer } = await import("./board_model");

    // UPSERT vote
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });
    // getBoardServer
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await voteNoteServer("board-1", "note-1", "user-1", 1);

    expect(mockPoolQuery.mock.calls[0][0]).toContain("INSERT INTO note_votes");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["note-1", "user-1", 1]);
  });

  it("decrements and cleans up vote row when delta is negative", async () => {
    const { voteNoteServer } = await import("./board_model");

    // UPDATE count
    mockPoolQuery.mockResolvedValueOnce({});
    // DELETE if count <= 0
    mockPoolQuery.mockResolvedValueOnce({});
    // getBoardServer
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await voteNoteServer("board-1", "note-1", "user-1", -1);

    expect(mockPoolQuery.mock.calls[0][0]).toContain("UPDATE note_votes SET count");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["note-1", "user-1", -1]);
    expect(mockPoolQuery.mock.calls[1][0]).toContain("DELETE FROM note_votes");
    expect(mockPoolQuery.mock.calls[1][0]).toContain("count <= 0");
  });
});

describe("archiveBoardServer", () => {
  it("sets archived_at when the user is the board owner", async () => {
    const { archiveBoardServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ role: "owner" }] }); // ownership check
    mockPoolQuery.mockResolvedValueOnce({}); // UPDATE boards SET archived_at

    await archiveBoardServer("board-1", "user-1");

    const updateCall = mockPoolQuery.mock.calls[1];
    expect(updateCall[0]).toContain("UPDATE boards SET archived_at");
    expect(updateCall[1]).toEqual(["board-1"]);
  });

  it("throws when user is not the board owner", async () => {
    const { archiveBoardServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ role: "member" }] });

    await expect(archiveBoardServer("board-1", "user-2")).rejects.toThrow(
      "Only the board owner can archive a board"
    );
  });

  it("throws when user is not a board member", async () => {
    const { archiveBoardServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(archiveBoardServer("board-1", "stranger")).rejects.toThrow(
      "Only the board owner can archive a board"
    );
  });
});

describe("unarchiveBoardServer", () => {
  it("clears archived_at when the user is the board owner", async () => {
    const { unarchiveBoardServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ role: "owner" }] }); // ownership check
    mockPoolQuery.mockResolvedValueOnce({}); // UPDATE boards SET archived_at = NULL

    await unarchiveBoardServer("board-1", "user-1");

    const updateCall = mockPoolQuery.mock.calls[1];
    expect(updateCall[0]).toContain("UPDATE boards SET archived_at = NULL");
    expect(updateCall[1]).toEqual(["board-1"]);
  });

  it("throws when user is not the board owner", async () => {
    const { unarchiveBoardServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(unarchiveBoardServer("board-1", "stranger")).rejects.toThrow(
      "Only the board owner can unarchive a board"
    );
  });
});

describe("facilitators", () => {
  it("addFacilitatorServer upserts without demoting an owner", async () => {
    const { addFacilitatorServer } = await import("./board_model");
    mockPoolQuery.mockResolvedValueOnce({});
    await addFacilitatorServer("board-1", "user-2");
    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("INSERT INTO board_members");
    expect(call[0]).toContain("'facilitator'");
    expect(call[0]).toContain("WHEN board_members.role = 'owner' THEN 'owner'");
    expect(call[1]).toEqual(["board-1", "user-2"]);
  });

  it("removeFacilitatorServer only deletes facilitator rows", async () => {
    const { removeFacilitatorServer } = await import("./board_model");
    mockPoolQuery.mockResolvedValueOnce({});
    await removeFacilitatorServer("board-1", "user-2");
    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("role = 'facilitator'");
    expect(call[1]).toEqual(["board-1", "user-2"]);
  });

  it("setOpenFacilitationServer updates the board flag", async () => {
    const { setOpenFacilitationServer } = await import("./board_model");
    mockPoolQuery.mockResolvedValueOnce({});
    await setOpenFacilitationServer("board-1", true);
    expect(mockPoolQuery.mock.calls[0][0]).toContain("SET open_facilitation");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([true, "board-1"]);
  });

  it("listFacilitatorsServer returns owner first with usernames", async () => {
    const { listFacilitatorsServer } = await import("./board_model");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [
        { user_id: "u1", role: "owner", username: "landon" },
        { user_id: "u2", role: "facilitator", username: "sam" },
      ],
    });
    const rows = await listFacilitatorsServer("board-1");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("role IN ('owner', 'facilitator')");
    expect(rows[0].role).toBe("owner");
  });
});

describe("getBoardServer facilitation + action item fields", () => {
  it("selects canFacilitate, openFacilitation, and actionItems in the board JSON", async () => {
    const { getBoardServer } = await import("./board_model");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ board: { id: "board-1", columns: [], actionItems: [] } }],
    });
    await getBoardServer("board-1", "user-1");
    const sql = mockPoolQuery.mock.calls[0][0] as string;
    expect(sql).toContain("'canFacilitate'");
    expect(sql).toContain("'openFacilitation', b.open_facilitation");
    expect(sql).toContain("'actionItems'");
    expect(sql).toContain("FROM action_items ai");
    expect(sql).toContain("bm2.role IN ('owner', 'facilitator')");
    // Crew name for the board title tag
    expect(sql).toContain("'team_name'");
    expect(sql).toContain("MAX(t.name)");
    expect(sql).toContain("LEFT JOIN teams t ON t.id = b.team_id");
  });
});

describe("createBoardWithColumns", () => {
  it("creates a board with caller-supplied custom columns in order", async () => {
    const { createBoardWithColumns } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({}); // INSERT board
    mockQuery.mockResolvedValueOnce({}); // INSERT board_member (owner)
    mockQuery.mockResolvedValueOnce({}); // INSERT column 0
    mockQuery.mockResolvedValueOnce({}); // INSERT column 1
    mockQuery.mockResolvedValueOnce({}); // INSERT column 2
    mockQuery.mockResolvedValueOnce({}); // COMMIT

    const id = await createBoardWithColumns(
      "Roadmap H2",
      [
        { title: "Backend" },
        { title: "Frontend", prompt: "User-visible work" },
        { title: "Out of scope" },
      ],
      "agent-user-1"
    );

    expect(typeof id).toBe("string");
    expect(id).toHaveLength(36);

    // Board insert: title is the second positional arg
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO boards");
    expect(mockQuery.mock.calls[1][1][1]).toBe("Roadmap H2");

    // Member insert: agent is owner
    expect(mockQuery.mock.calls[2][0]).toContain("INSERT INTO board_members");
    expect(mockQuery.mock.calls[2][0]).toContain("owner");

    // Column inserts: titles in order, with prompts respected
    expect(mockQuery.mock.calls[3][1][2]).toBe("Backend");
    expect(mockQuery.mock.calls[3][1][3]).toBe(0);
    expect(mockQuery.mock.calls[3][1][4]).toBe("");
    expect(mockQuery.mock.calls[4][1][2]).toBe("Frontend");
    expect(mockQuery.mock.calls[4][1][4]).toBe("User-visible work");
    expect(mockQuery.mock.calls[5][1][2]).toBe("Out of scope");

    // Final COMMIT
    expect(mockQuery.mock.calls[6][0]).toBe("COMMIT");
    expect(mockRelease).toHaveBeenCalled();
  });

  it("falls back to default retro columns when called with an empty array", async () => {
    const { createBoardWithColumns } = await import("./board_model");

    mockQuery.mockResolvedValue({}); // any number of calls return empty

    await createBoardWithColumns("Plain Retro", [], "user-1");

    const inserted = mockQuery.mock.calls
      .filter((c) => typeof c[0] === "string" && c[0].includes("INSERT INTO columns"))
      .map((c) => c[1][2]);
    expect(inserted).toEqual([
      "What went well?",
      "What can we do better?",
    ]);
  });

  it("skips the board_members row when userId is null", async () => {
    const { createBoardWithColumns } = await import("./board_model");

    mockQuery.mockResolvedValue({});

    await createBoardWithColumns("Ownerless", [{ title: "A" }], null);

    const memberInserts = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO board_members")
    );
    expect(memberInserts).toHaveLength(0);
  });

  it("threads teamId into the boards INSERT (null = trial pool, uuid = team-owned)", async () => {
    const { createBoardWithColumns } = await import("./board_model");

    mockQuery.mockResolvedValue({});

    await createBoardWithColumns("Team Board", [{ title: "X" }], "user-1", "team-acme");

    const boardInsert = mockQuery.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO boards")
    );
    expect(boardInsert).toBeDefined();
    expect(boardInsert![1]).toEqual(["team-acme", "Team Board", "user-1", "team-acme"].slice(0).length
      ? expect.arrayContaining(["Team Board", "user-1", "team-acme"]) : []);
  });

  it("rolls back when an insert fails", async () => {
    const { createBoardWithColumns } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockRejectedValueOnce(new Error("constraint violation"));
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      createBoardWithColumns("X", [{ title: "A" }], "u")
    ).rejects.toThrow("constraint violation");
    expect(mockQuery.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("bulkInsertNotesServer", () => {
  it("inserts notes into validated columns and continues note_order from existing max", async () => {
    const { bulkInsertNotesServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "col-a" }, { id: "col-b" }] }); // SELECT id FROM columns
    mockQuery.mockResolvedValueOnce({ rows: [{ next: 3 }] }); // max+1 for col-a (existing 2 -> next 3)
    mockQuery.mockResolvedValueOnce({ rows: [{ next: 0 }] }); // max+1 for col-b (empty)
    mockQuery.mockResolvedValueOnce({}); // INSERT note 1
    mockQuery.mockResolvedValueOnce({}); // INSERT note 2
    mockQuery.mockResolvedValueOnce({}); // INSERT note 3
    mockQuery.mockResolvedValueOnce({}); // COMMIT
    // getBoardServer at the end
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ board: { id: "board-1", columns: [] } }],
    });

    const result = await bulkInsertNotesServer(
      "board-1",
      [
        { columnId: "col-a", text: "first" },
        { columnId: "col-a", text: "second" },
        { columnId: "col-b", text: "third" },
      ],
      "agent-1"
    );

    // Note inserts: col-a starts at 3, col-b at 0
    const noteInserts = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO notes")
    );
    expect(noteInserts).toHaveLength(3);
    expect(noteInserts[0][1][1]).toBe("col-a");
    expect(noteInserts[0][1][2]).toBe("first");
    expect(noteInserts[0][1][4]).toBe(3); // note_order
    expect(noteInserts[1][1][4]).toBe(4); // next in col-a
    expect(noteInserts[2][1][1]).toBe("col-b");
    expect(noteInserts[2][1][4]).toBe(0); // first in col-b

    expect(result).toBeTruthy();
    expect(mockRelease).toHaveBeenCalled();
  });

  it("rejects the whole batch when a columnId does not belong to the board", async () => {
    const { bulkInsertNotesServer } = await import("./board_model");

    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "col-a" }] }); // SELECT only finds col-a
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      bulkInsertNotesServer(
        "board-1",
        [
          { columnId: "col-a", text: "ok" },
          { columnId: "col-bad", text: "no" },
        ],
        "user-1"
      )
    ).rejects.toThrow(/COLUMN_NOT_ON_BOARD/);

    const noteInserts = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("INSERT INTO notes")
    );
    expect(noteInserts).toHaveLength(0);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("returns the current board state without inserting when given an empty array", async () => {
    const { bulkInsertNotesServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ board: { id: "board-1", columns: [] } }],
    });

    const result = await bulkInsertNotesServer("board-1", [], "user-1");
    expect(result).toBeTruthy();
    expect(mockQuery).not.toHaveBeenCalled();
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

describe("listVisibleBoards", () => {
  it("lists active, user-visible boards ordered by the given expression", async () => {
    const { listVisibleBoards } = await import("./board_model");
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: "b1", title: "Retro", role: "owner" }] });

    const rows = await listVisibleBoards("user-1", { order: "updated_at DESC" });

    const [sql, params] = mockPoolQuery.mock.calls[0];
    expect(sql).toContain("archived_at IS NULL");
    expect(sql).toContain("team_members");                 // dashboard-wide visibility clause
    expect(sql).toContain("ORDER BY updated_at DESC");
    expect(sql).toContain("COALESCE(bm.role, 'team')");
    expect(params).toEqual(["user-1"]);
    expect(rows).toEqual([{ id: "b1", title: "Retro", role: "owner" }]);
  });

  it("scopes to a single crew's boards when teamId is given (no visibility clause)", async () => {
    const { listVisibleBoards } = await import("./board_model");
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await listVisibleBoards("user-1", { teamId: "t9", order: "created_at DESC" });

    const [sql, params] = mockPoolQuery.mock.calls[0];
    expect(sql).toContain("AND b.team_id = $2");
    expect(sql).not.toContain("team_members");
    expect(params).toEqual(["user-1", "t9"]);
  });

  it("lists archived boards when archived is true", async () => {
    const { listVisibleBoards } = await import("./board_model");
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    await listVisibleBoards("user-1", { archived: true, order: "title ASC" });

    expect(mockPoolQuery.mock.calls[0][0]).toContain("archived_at IS NOT NULL");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("ORDER BY title ASC");
  });
});
