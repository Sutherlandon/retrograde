import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBulkInsertNotesServer = vi.fn();
vi.mock("~/server/board_model", () => ({
  bulkInsertNotesServer: (...args: unknown[]) => mockBulkInsertNotesServer(...args),
}));

const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getApiUser: (...args: unknown[]) => mockGetApiUser(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockBulkInsertNotesServer.mockResolvedValue({ id: "board-1", columns: [] });
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
  it("inserts notes when authenticated via Bearer", async () => {
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
