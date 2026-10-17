// app/routes/api/board.columns.$columnId.test.ts
// PATCH / DELETE /api/v1/boards/:id/columns/:columnId — API-012, API-013, API-014.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockColumnIsOnBoard = vi.fn();
const mockUpdateColumn = vi.fn();
const mockDeleteColumn = vi.fn();
vi.mock("~/server/board_model", () => ({
  columnIsOnBoard: (...a: unknown[]) => mockColumnIsOnBoard(...a),
  updateColumnServer: (...a: unknown[]) => mockUpdateColumn(...a),
  deleteColumnServer: (...a: unknown[]) => mockDeleteColumn(...a),
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

const params = { id: "board-1", columnId: "col-1" };

function req(method: string, body?: unknown) {
  return new Request("http://localhost:3000/api/v1/boards/board-1/columns/col-1", {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer rk_live_x" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function run(request: Request) {
  const { action } = await import("./board.columns.$columnId");
  try {
    return (await action({ request, params, context: {} } as never)) as Response;
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
  mockColumnIsOnBoard.mockResolvedValue(true);
  mockUpdateColumn.mockResolvedValue({ id: "board-1", columns: [] });
  mockDeleteColumn.mockResolvedValue({ id: "board-1", columns: [] });
});

describe("PATCH /api/v1/boards/:id/columns/:columnId", () => {
  it("API-012: renaming is participant-level and blocked by either lock (BRD-011)", async () => {
    mockUserCanFacilitate.mockResolvedValue(false);
    const res = await run(req("PATCH", { title: " Shipped " }));
    expect(res.status).toBe(200);
    expect(mockUpdateColumn).toHaveBeenCalledWith("board-1", "col-1", { title: "Shipped", prompt: undefined }, "agent-1");
    expect(mockUserCanFacilitate).not.toHaveBeenCalled();
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { notes: true, board: false });
  });

  it("API-013: setting the prompt takes a facilitator and only the board lock (BRD-012)", async () => {
    const res = await run(req("PATCH", { prompt: "What shipped this week?" }));
    expect(res.status).toBe(200);
    expect(mockUserCanFacilitate).toHaveBeenCalledWith("agent-1", "board-1");
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { notes: false, board: true });
    expect(mockUpdateColumn).toHaveBeenCalledWith("board-1", "col-1", { title: undefined, prompt: "What shipped this week?" }, "agent-1");
  });

  it("API-013: an empty prompt clears it", async () => {
    await run(req("PATCH", { prompt: "" }));
    expect(mockUpdateColumn).toHaveBeenCalledWith("board-1", "col-1", { title: undefined, prompt: "" }, "agent-1");
  });

  it("API-013: 403 for a prompt when the caller cannot facilitate, writing nothing", async () => {
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    expect((await run(req("PATCH", { title: "x", prompt: "y" }))).status).toBe(403);
    expect(mockUpdateColumn).not.toHaveBeenCalled();
  });

  it("both fields apply both rules", async () => {
    await run(req("PATCH", { title: "x", prompt: "y" }));
    expect(mockUserCanFacilitate).toHaveBeenCalled();
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { notes: true, board: true });
  });

  it("423 when a lock applies", async () => {
    mockLockReason.mockResolvedValueOnce("Notes are locked");
    expect((await run(req("PATCH", { title: "x" }))).status).toBe(423);
    expect(mockUpdateColumn).not.toHaveBeenCalled();
  });

  it("404 when the column isn't on this board", async () => {
    mockColumnIsOnBoard.mockResolvedValueOnce(false);
    expect((await run(req("PATCH", { title: "x" }))).status).toBe(404);
    expect(mockColumnIsOnBoard).toHaveBeenCalledWith("board-1", "col-1");
    expect(mockUpdateColumn).not.toHaveBeenCalled();
  });

  it.each([
    [{}, "neither field"],
    [{ title: " " }, "blank title"],
    [{ title: "x".repeat(101) }, "title over 100 chars"],
    [{ prompt: 1 }, "non-string prompt"],
    [{ prompt: "p".repeat(2001) }, "prompt over 2000 chars"],
  ])("400 for %j (%s)", async (body, _reason) => {
    expect((await run(req("PATCH", body))).status).toBe(400);
    expect(mockUpdateColumn).not.toHaveBeenCalled();
  });

  it("403 without board access, before anything else", async () => {
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: false });
    expect((await run(req("PATCH", { title: "x" }))).status).toBe(403);
    expect(mockUpdateColumn).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/boards/:id/columns/:columnId (API-014)", () => {
  it("deletes the column, with its notes, for a facilitator", async () => {
    const res = await run(req("DELETE"));
    expect(res.status).toBe(200);
    expect(mockDeleteColumn).toHaveBeenCalledWith("board-1", "col-1", "agent-1");
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { board: true });
  });

  it("403 when the caller cannot facilitate (BRD-013's rule)", async () => {
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    expect((await run(req("DELETE"))).status).toBe(403);
    expect(mockDeleteColumn).not.toHaveBeenCalled();
  });

  it("423 when the board is locked", async () => {
    mockLockReason.mockResolvedValueOnce("Board is locked");
    expect((await run(req("DELETE"))).status).toBe(423);
    expect(mockDeleteColumn).not.toHaveBeenCalled();
  });

  it("404 when the column isn't on this board", async () => {
    mockColumnIsOnBoard.mockResolvedValueOnce(false);
    expect((await run(req("DELETE"))).status).toBe(404);
    expect(mockDeleteColumn).not.toHaveBeenCalled();
  });

  it("401 without credentials", async () => {
    mockGetApiUser.mockResolvedValueOnce(null);
    expect((await run(req("DELETE"))).status).toBe(401);
  });
});

describe("other methods", () => {
  it("405", async () => {
    expect((await run(req("POST", {}))).status).toBe(405);
    const { loader } = await import("./board.columns.$columnId");
    expect((loader() as Response).status).toBe(405);
  });
});
