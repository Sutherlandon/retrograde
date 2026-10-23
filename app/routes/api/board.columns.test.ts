// app/routes/api/board.columns.test.ts
// POST /api/v1/boards/:id/columns — API-011.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAppendColumn = vi.fn();
vi.mock("~/server/board_model", () => ({
  appendColumnServer: (...a: unknown[]) => mockAppendColumn(...a),
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

function req(body: unknown, method = "POST") {
  return new Request("http://localhost:3000/api/v1/boards/board-1/columns", {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer rk_live_x" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function run(request: Request) {
  const { action } = await import("./board.columns");
  try {
    return (await action({ request, params: { id: "board-1" }, context: {} } as never)) as Response;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ id: "agent-1", username: "Timekeeper", teamId: "team-a" });
  mockGetBoardAccess.mockResolvedValue({ exists: true, allowed: true, userIsRegistered: false });
  mockUserCanFacilitate.mockResolvedValue(true);
  mockLockReason.mockResolvedValue(null);
  mockAppendColumn.mockResolvedValue({ columnId: "col-new", board: { id: "board-1", columns: [{ id: "col-new" }] } });
});

describe("POST /api/v1/boards/:id/columns (API-011)", () => {
  it("adds a column for a facilitator: 201, the board, and the column's URL", async () => {
    const res = await run(req({ title: " Blocked ", prompt: "Waiting on someone" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("Location")).toBe("/api/v1/boards/board-1/columns/col-new");
    expect(await res.json()).toEqual({ id: "board-1", columns: [{ id: "col-new" }] });
    expect(mockAppendColumn).toHaveBeenCalledWith("board-1", "Blocked", "Waiting on someone", "agent-1");
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { board: true });
  });

  it("defaults the prompt to empty", async () => {
    await run(req({ title: "Done" }));
    expect(mockAppendColumn).toHaveBeenCalledWith("board-1", "Done", "", "agent-1");
  });

  it("403 when the caller cannot facilitate (DECK-006's rule)", async () => {
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    expect((await run(req({ title: "x" }))).status).toBe(403);
    expect(mockAppendColumn).not.toHaveBeenCalled();
  });

  it("423 when the board is locked", async () => {
    mockLockReason.mockResolvedValueOnce("Board is locked");
    expect((await run(req({ title: "x" }))).status).toBe(423);
    expect(mockAppendColumn).not.toHaveBeenCalled();
  });

  it("401 without credentials; 403 without board access", async () => {
    mockGetApiUser.mockResolvedValueOnce(null);
    expect((await run(req({ title: "x" }))).status).toBe(401);
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: false });
    expect((await run(req({ title: "x" }))).status).toBe(403);
    expect(mockAppendColumn).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "missing title"],
    [{ title: "  " }, "blank title"],
    [{ title: "x".repeat(101) }, "title over 100 chars"],
    [{ title: "x", prompt: 4 }, "non-string prompt"],
    [{ title: "x", prompt: "p".repeat(2001) }, "prompt over 2000 chars"],
  ])("400 for %j (%s)", async (body, _reason) => {
    expect((await run(req(body))).status).toBe(400);
    expect(mockAppendColumn).not.toHaveBeenCalled();
  });

  it("405 for other methods", async () => {
    expect((await run(req({ title: "x" }, "PUT"))).status).toBe(405);
    const { loader } = await import("./board.columns");
    expect((loader() as Response).status).toBe(405);
  });
});
