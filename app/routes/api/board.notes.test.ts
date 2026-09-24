import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBulkInsertNotesServer = vi.fn();
vi.mock("~/server/board_model", () => ({
  bulkInsertNotesServer: (...args: unknown[]) => mockBulkInsertNotesServer(...args),
}));

const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getApiUser: (...args: unknown[]) => mockGetApiUser(...args),
}));

const mockGetBoardAccess = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  getBoardAccess: (...args: unknown[]) => mockGetBoardAccess(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockBulkInsertNotesServer.mockResolvedValue({ id: "board-1", columns: [] });
  mockGetBoardAccess.mockResolvedValue({ exists: true, allowed: true, userIsRegistered: true });
});

function req(body: unknown, opts: { auth?: string } = {}) {
  return new Request("http://localhost:3000/api/v1/boards/board-1/notes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.auth ? { Authorization: opts.auth } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/v1/boards/:id/notes", () => {
  it("inserts notes when authenticated via Bearer (API-004)", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1" });

    const response = (await action({
      request: req(
        {
          notes: [
            { columnId: "c1", text: "hello" },
            { columnId: "c2", text: "world" },
          ],
        },
        { auth: "Bearer token-x" }
      ),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;

    expect(response.status).toBe(201);
    expect(mockBulkInsertNotesServer).toHaveBeenCalledWith(
      "board-1",
      [
        { columnId: "c1", text: "hello" },
        { columnId: "c2", text: "world" },
      ],
      "agent-1"
    );
  });

  it("returns 401 when no auth resolves to a user", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce(null);

    const response = (await action({
      request: req({ notes: [{ columnId: "c1", text: "x" }] }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(401);
  });

  it("returns 400 when notes is missing or empty", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValue({ id: "agent-1" });

    const r1 = (await action({
      request: req({}),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(r1.status).toBe(400);

    const r2 = (await action({
      request: req({ notes: [] }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(r2.status).toBe(400);
  });

  it("returns 413 when batch exceeds 200 notes", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1" });

    const notes = Array.from({ length: 201 }, (_, i) => ({
      columnId: "c1",
      text: `note ${i}`,
    }));
    const response = (await action({
      request: req({ notes }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(413);
  });

  it("returns 400 when a note text is empty", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1" });

    const response = (await action({
      request: req({ notes: [{ columnId: "c1", text: "   " }] }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(400);
  });

  it("checks board access before inserting notes (GAP-004)", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1", teamId: "team-1" });

    await action({
      request: req({ notes: [{ columnId: "c1", text: "hello" }] }, { auth: "Bearer token-x" }),
      params: { id: "board-1" },
      context: {},
    } as never);

    expect(mockGetBoardAccess).toHaveBeenCalledWith("board-1", "agent-1", "team-1");
  });

  it("returns 404 when the board does not exist", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1" });
    mockGetBoardAccess.mockResolvedValueOnce({ exists: false, allowed: false, userIsRegistered: false });

    const response = (await action({
      request: req({ notes: [{ columnId: "c1", text: "hello" }] }, { auth: "Bearer token-x" }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(mockBulkInsertNotesServer).not.toHaveBeenCalled();
  });

  it("returns 403 when an out-of-crew key writes to a members-only board", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1", teamId: "team-9" });
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: true });

    const response = (await action({
      request: req({ notes: [{ columnId: "c1", text: "hello" }] }, { auth: "Bearer token-x" }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("This board is restricted to its crew");
    expect(mockBulkInsertNotesServer).not.toHaveBeenCalled();
  });

  it("allows any authenticated caller on a crewless board", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1" });
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: true, userIsRegistered: false });

    const response = (await action({
      request: req({ notes: [{ columnId: "c1", text: "hello" }] }, { auth: "Bearer token-x" }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(201);
    expect(mockBulkInsertNotesServer).toHaveBeenCalled();
  });

  it("translates COLUMN_NOT_ON_BOARD into a 400 with a clear message", async () => {
    const { action } = await import("./board.notes");
    mockGetApiUser.mockResolvedValueOnce({ id: "agent-1" });
    mockBulkInsertNotesServer.mockRejectedValueOnce(
      new Error("COLUMN_NOT_ON_BOARD:col-x,col-y")
    );

    const response = (await action({
      request: req({ notes: [{ columnId: "col-x", text: "x" }] }),
      params: { id: "board-1" },
      context: {},
    } as never)) as Response;
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toContain("col-x");
  });
});
