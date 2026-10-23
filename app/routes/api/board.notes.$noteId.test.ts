// app/routes/api/board.notes.$noteId.test.ts
// PATCH / DELETE /api/v1/boards/:id/notes/:noteId — API-009, API-010.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindNoteColumn = vi.fn();
const mockColumnIsOnBoard = vi.fn();
const mockUpdateNote = vi.fn();
const mockDeleteNote = vi.fn();
vi.mock("~/server/board_model", () => ({
  findNoteColumnOnBoard: (...a: unknown[]) => mockFindNoteColumn(...a),
  columnIsOnBoard: (...a: unknown[]) => mockColumnIsOnBoard(...a),
  updateNoteServer: (...a: unknown[]) => mockUpdateNote(...a),
  deleteNoteServer: (...a: unknown[]) => mockDeleteNote(...a),
}));

const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getApiUser: (...a: unknown[]) => mockGetApiUser(...a),
}));

const mockGetBoardAccess = vi.fn();
const mockUserCanFacilitate = vi.fn();
const mockLockReason = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  getBoardAccess: (...a: unknown[]) => mockGetBoardAccess(...a),
  userCanFacilitate: (...a: unknown[]) => mockUserCanFacilitate(...a),
  lockReason: (...a: unknown[]) => mockLockReason(...a),
}));

const URL_BASE = "http://localhost:3000/api/v1/boards/board-1/notes/note-1";
const params = { id: "board-1", noteId: "note-1" };

function req(method: string, body?: unknown) {
  return new Request(URL_BASE, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer rk_live_x" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function run(request: Request) {
  const { action } = await import("./board.notes.$noteId");
  try {
    return (await action({ request, params, context: {} } as never)) as Response;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ id: "agent-1", username: "Timekeeper", teamId: "team-a" });
  mockGetBoardAccess.mockResolvedValue({ exists: true, allowed: true, userIsRegistered: false });
  mockUserCanFacilitate.mockResolvedValue(false);
  mockLockReason.mockResolvedValue(null);
  mockFindNoteColumn.mockResolvedValue("col-1");
  mockColumnIsOnBoard.mockResolvedValue(true);
  mockUpdateNote.mockResolvedValue({ id: "board-1", columns: [] });
  mockDeleteNote.mockResolvedValue({ id: "board-1", columns: [] });
});

describe("PATCH /api/v1/boards/:id/notes/:noteId (API-009)", () => {
  it("edits the text — participant-level, no facilitation needed", async () => {
    const res = await run(req("PATCH", { text: "  Closed out  " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "board-1", columns: [] });
    expect(mockUpdateNote).toHaveBeenCalledWith("board-1", "note-1", { text: "Closed out", columnId: undefined }, "agent-1");
    expect(mockUserCanFacilitate).not.toHaveBeenCalled();
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { notes: true });
  });

  it("moves the note to another column of the board", async () => {
    const res = await run(req("PATCH", { columnId: "col-2" }));
    expect(res.status).toBe(200);
    expect(mockColumnIsOnBoard).toHaveBeenCalledWith("board-1", "col-2");
    expect(mockUpdateNote).toHaveBeenCalledWith("board-1", "note-1", { text: undefined, columnId: "col-2" }, "agent-1");
  });

  it("edits and moves in one call", async () => {
    await run(req("PATCH", { text: "Moved", columnId: "col-2" }));
    expect(mockUpdateNote).toHaveBeenCalledWith("board-1", "note-1", { text: "Moved", columnId: "col-2" }, "agent-1");
  });

  it("404 when the note isn't on this board", async () => {
    mockFindNoteColumn.mockResolvedValueOnce(null);
    const res = await run(req("PATCH", { text: "x" }));
    expect(res.status).toBe(404);
    expect(await code(res)).toBe("NOT_FOUND");
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });

  it("400 when the destination column isn't on this board", async () => {
    mockColumnIsOnBoard.mockResolvedValueOnce(false);
    const res = await run(req("PATCH", { columnId: "col-elsewhere" }));
    expect(res.status).toBe(400);
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "neither field"],
    [{ text: "   " }, "blank text"],
    [{ text: "x".repeat(2001) }, "text over 2000 chars"],
    [{ text: 3 }, "non-string text"],
    [{ columnId: 7 }, "non-string columnId"],
    [{ columnId: "" }, "empty columnId"],
    ["[]", "an array body"],
  ])("400 for %j (%s)", async (body, _reason) => {
    const res = await run(req("PATCH", body));
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("BAD_REQUEST");
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });

  it("423 when notes are locked", async () => {
    mockLockReason.mockResolvedValueOnce("Notes are locked");
    const res = await run(req("PATCH", { text: "x" }));
    expect(res.status).toBe(423);
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });

  it("401 without credentials and 403 without board access", async () => {
    mockGetApiUser.mockResolvedValueOnce(null);
    expect((await run(req("PATCH", { text: "x" }))).status).toBe(401);
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: false });
    expect((await run(req("PATCH", { text: "x" }))).status).toBe(403);
    expect(mockUpdateNote).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/boards/:id/notes/:noteId (API-010)", () => {
  it("deletes the note and returns the board", async () => {
    const res = await run(req("DELETE"));
    expect(res.status).toBe(200);
    expect(mockDeleteNote).toHaveBeenCalledWith("board-1", "col-1", "note-1", "agent-1");
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { notes: true });
    expect(mockUserCanFacilitate).not.toHaveBeenCalled();
  });

  it("404 when the note isn't on this board", async () => {
    mockFindNoteColumn.mockResolvedValueOnce(null);
    expect((await run(req("DELETE"))).status).toBe(404);
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });

  it("423 when the board is locked", async () => {
    mockLockReason.mockResolvedValueOnce("Board is locked");
    expect((await run(req("DELETE"))).status).toBe(423);
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });

  it("403 for a key from another crew on a members-only board", async () => {
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: false });
    expect((await run(req("DELETE"))).status).toBe(403);
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });
});

describe("other methods", () => {
  it("405 for POST", async () => {
    expect((await run(req("POST", {}))).status).toBe(405);
  });

  it("405 for GET", async () => {
    const { loader } = await import("./board.notes.$noteId");
    expect((loader() as Response).status).toBe(405);
  });
});
