import { describe, it, expect, vi, beforeEach } from "vitest";

// Track session data across mock calls
let sessionData: Record<string, string> = {};

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({
    get: (key: string) => sessionData[key],
    set: (key: string, value: string) => { sessionData[key] = value; },
    unset: (key: string) => { delete sessionData[key]; },
  })),
  commitSession: vi.fn(async () => "session-cookie-value"),
}));

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { usernameField: "preferred_username" },
}));

const mockRequireBoardAccess = vi.fn();
const mockRequireUnlocked = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireBoardAccess: (...args: unknown[]) => mockRequireBoardAccess(...args),
  requireUnlocked: (...args: unknown[]) => mockRequireUnlocked(...args),
}));

const mockUpsertNote = vi.fn();
const mockLikeNote = vi.fn();
const mockVoteNote = vi.fn();
const mockDeleteNote = vi.fn();
const mockMoveNote = vi.fn();
const mockReorderNotes = vi.fn();

vi.mock("~/server/board_model", () => ({
  upsertNoteServer: (...args: unknown[]) => mockUpsertNote(...args),
  likeNoteServer: (...args: unknown[]) => mockLikeNote(...args),
  voteNoteServer: (...args: unknown[]) => mockVoteNote(...args),
  deleteNoteServer: (...args: unknown[]) => mockDeleteNote(...args),
  moveNoteServer: (...args: unknown[]) => mockMoveNote(...args),
  reorderNotesServer: (...args: unknown[]) => mockReorderNotes(...args),
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockRequireBoardAccess.mockResolvedValue(null);
  mockRequireUnlocked.mockResolvedValue(undefined);
});

function makePatchRequest(boardId: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return new Request(`http://localhost:3000/app/board/${boardId}/notes`, {
    method: "PATCH",
    body: form,
  });
}

describe("board.notes action", () => {
  describe("vote intent", () => {
    it("allows anonymous user with session to vote", async () => {
      const { action } = await import("./board.notes");

      sessionData["userId"] = "anon-user-1";
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: "anon-user-1", preferred_username: "Guest", is_anonymous: true }],
        rowCount: 1,
      });
      mockVoteNote.mockResolvedValueOnce({ ok: true });

      const request = makePatchRequest("board-1", { intent: "vote", noteId: "note-1", delta: "1" });
      await action({ request, params: { id: "board-1" }, context: {} });

      expect(mockVoteNote).toHaveBeenCalledWith("board-1", "note-1", "anon-user-1", 1);
    });

    it("allows registered user to vote", async () => {
      const { action } = await import("./board.notes");

      sessionData["userId"] = "user-1";
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: "user-1", preferred_username: "realuser", is_anonymous: false }],
        rowCount: 1,
      });
      mockVoteNote.mockResolvedValueOnce({ ok: true });

      const request = makePatchRequest("board-1", { intent: "vote", noteId: "note-1", delta: "1" });
      await action({ request, params: { id: "board-1" }, context: {} });

      expect(mockVoteNote).toHaveBeenCalledWith("board-1", "note-1", "user-1", 1);
    });

    it("returns 401 when no user session exists at all", async () => {
      const { action } = await import("./board.notes");

      const request = makePatchRequest("board-1", { intent: "vote", noteId: "note-1", delta: "1" });

      try {
        await action({ request, params: { id: "board-1" }, context: {} });
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        const res = response as Response;
        expect(res.status).toBe(401);
      }
    });
  });

  describe("upsert (default PATCH)", () => {
    it("creates note with anonymous user's id as created_by", async () => {
      const { action } = await import("./board.notes");

      sessionData["userId"] = "anon-user-1";
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: "anon-user-1", preferred_username: "Guest" }],
        rowCount: 1,
      });
      mockUpsertNote.mockResolvedValueOnce({ ok: true });

      const request = makePatchRequest("board-1", {
        noteId: "note-1",
        columnId: "col-1",
        text: "My note",
        likes: "0",
        created: "1234567890",
      });
      await action({ request, params: { id: "board-1" }, context: {} });

      expect(mockUpsertNote).toHaveBeenCalledWith(
        "board-1", "note-1", "col-1", "My note", 0, "1234567890", "anon-user-1"
      );
    });

    it("creates note without user id when no session", async () => {
      const { action } = await import("./board.notes");

      mockUpsertNote.mockResolvedValueOnce({ ok: true });

      const request = makePatchRequest("board-1", {
        noteId: "note-1",
        columnId: "col-1",
        text: "Guest note",
        likes: "0",
        created: "1234567890",
      });
      await action({ request, params: { id: "board-1" }, context: {} });

      expect(mockUpsertNote).toHaveBeenCalledWith(
        "board-1", "note-1", "col-1", "Guest note", 0, "1234567890", undefined
      );
    });
  });

  describe("like intent", () => {
    it("tracks like with anonymous user id", async () => {
      const { action } = await import("./board.notes");

      sessionData["userId"] = "anon-user-1";
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: "anon-user-1", preferred_username: "Guest" }],
        rowCount: 1,
      });
      mockLikeNote.mockResolvedValueOnce({ ok: true });

      const request = makePatchRequest("board-1", {
        intent: "like",
        noteId: "note-1",
        delta: "1",
      });
      await action({ request, params: { id: "board-1" }, context: {} });

      expect(mockLikeNote).toHaveBeenCalledWith("board-1", "note-1", 1, "anon-user-1");
    });
  });

  describe("board access check", () => {
    it("checks board access before an upsert", async () => {
      const { action } = await import("./board.notes");
      mockUpsertNote.mockResolvedValueOnce({ ok: true });

      const request = makePatchRequest("board-1", {
        noteId: "note-1",
        columnId: "col-1",
        text: "My note",
        likes: "0",
        created: "1234567890",
      });
      await action({ request, params: { id: "board-1" }, context: {} } as never);

      expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.any(Request), "board-1");
    });

    it("checks board access before a delete", async () => {
      const { action } = await import("./board.notes");
      mockDeleteNote.mockResolvedValueOnce({ ok: true });

      const request = new Request("http://localhost:3000/app/board/board-1/notes", {
        method: "DELETE",
        body: (() => {
          const form = new FormData();
          form.append("noteId", "note-1");
          form.append("columnId", "col-1");
          return form;
        })(),
      });
      await action({ request, params: { id: "board-1" }, context: {} } as never);

      expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.any(Request), "board-1");
      expect(mockDeleteNote).toHaveBeenCalled();
    });

    it("propagates the access check's rejection and never mutates notes", async () => {
      const { action } = await import("./board.notes");
      mockRequireBoardAccess.mockRejectedValueOnce(
        new Response("This board is restricted to its crew", { status: 403 })
      );

      const request = makePatchRequest("board-1", {
        noteId: "note-1",
        columnId: "col-1",
        text: "My note",
        likes: "0",
        created: "1234567890",
      });

      try {
        await action({ request, params: { id: "board-1" }, context: {} } as never);
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        expect((response as Response).status).toBe(403);
      }
      expect(mockUpsertNote).not.toHaveBeenCalled();
    });
  });

  describe("lock enforcement (GAP-003)", () => {
    it("checks notes: true before an upsert (BRD-004/005)", async () => {
      const { action } = await import("./board.notes");
      const request = makePatchRequest("board-1", {
        noteId: "note-1", columnId: "col-1", text: "My note", likes: "0", created: "1",
      });
      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { notes: true });
    });

    it("rejects an upsert with 423 when notes are locked", async () => {
      const { action } = await import("./board.notes");
      mockRequireUnlocked.mockRejectedValueOnce(new Response("Notes are locked", { status: 423 }));
      const request = makePatchRequest("board-1", {
        noteId: "note-1", columnId: "col-1", text: "My note", likes: "0", created: "1",
      });
      try {
        await action({ request, params: { id: "board-1" }, context: {} } as never);
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        expect((response as Response).status).toBe(423);
      }
      expect(mockUpsertNote).not.toHaveBeenCalled();
    });

    it("checks notes: true before a delete (BRD-006)", async () => {
      const { action } = await import("./board.notes");
      const request = new Request("http://localhost:3000/app/board/board-1/notes", {
        method: "DELETE",
        body: (() => {
          const form = new FormData();
          form.append("noteId", "note-1");
          form.append("columnId", "col-1");
          return form;
        })(),
      });
      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { notes: true });
    });

    it("checks notes: true before a move (BRD-007)", async () => {
      const { action } = await import("./board.notes");
      const request = makePatchRequest("board-1", {
        intent: "move", noteId: "note-1", fromColumnId: "col-1", toColumnId: "col-2",
      });
      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { notes: true });
    });

    it("checks notes: true before a reorder (BRD-008)", async () => {
      const { action } = await import("./board.notes");
      const request = makePatchRequest("board-1", {
        intent: "reorder", toColumnId: "col-1", orderedNoteIds: JSON.stringify(["n1", "n2"]),
      });
      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { notes: true });
    });

    it("checks board: true (not notes) before a like (BRD-009)", async () => {
      const { action } = await import("./board.notes");
      const request = makePatchRequest("board-1", { intent: "like", noteId: "note-1", delta: "1" });
      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { board: true });
      expect(mockRequireUnlocked).not.toHaveBeenCalledWith("board-1", { notes: true });
    });

    it("allows a like when notes are locked but the board is not", async () => {
      const { action } = await import("./board.notes");
      mockRequireUnlocked.mockResolvedValue(undefined); // requireUnlocked({board:true}) passes
      const request = makePatchRequest("board-1", { intent: "like", noteId: "note-1", delta: "1" });
      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockLikeNote).toHaveBeenCalled();
    });

    it("rejects a like with 423 when the board is locked", async () => {
      const { action } = await import("./board.notes");
      mockRequireUnlocked.mockRejectedValueOnce(new Response("Board is locked", { status: 423 }));
      const request = makePatchRequest("board-1", { intent: "like", noteId: "note-1", delta: "1" });
      try {
        await action({ request, params: { id: "board-1" }, context: {} } as never);
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        expect((response as Response).status).toBe(423);
      }
      expect(mockLikeNote).not.toHaveBeenCalled();
    });

    it("checks board: true (not notes) before a vote (BRD-010)", async () => {
      const { action } = await import("./board.notes");
      sessionData["userId"] = "user-1";
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: "user-1", preferred_username: "realuser", is_anonymous: false }],
        rowCount: 1,
      });
      const request = makePatchRequest("board-1", { intent: "vote", noteId: "note-1", delta: "1" });
      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockRequireUnlocked).toHaveBeenCalledWith("board-1", { board: true });
    });
  });
});
