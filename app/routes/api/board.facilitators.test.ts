// app/routes/api/board.facilitators.test.ts
// GET / POST /api/v1/boards/:id/facilitators — API-015, API-016.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetFacilitators = vi.fn();
const mockAdd = vi.fn();
vi.mock("~/server/board_model", () => ({
  getFacilitatorsServer: (...a: unknown[]) => mockGetFacilitators(...a),
  addFacilitatorServer: (...a: unknown[]) => mockAdd(...a),
}));

const mockFindUser = vi.fn();
vi.mock("~/server/admin_model", () => ({
  findRegisteredUserByUsername: (...a: unknown[]) => mockFindUser(...a),
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

const HUMAN_ID = "5b0c8f3e-1d2a-4c7b-9e6f-0a1b2c3d4e5f";
const BASE = "http://localhost:3000/api/v1/boards/board-1/facilitators";
const crew = [
  { user_id: "agent-1", role: "owner", username: "Timekeeper" },
  { user_id: HUMAN_ID, role: "facilitator", username: "landon" },
];

function req(method: string, url = BASE, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer rk_live_x" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(fn: (args: never) => unknown, request: Request, params: Record<string, string>) {
  try {
    return (await fn({ request, params, context: {} } as never)) as Response;
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
  mockGetFacilitators.mockResolvedValue({ facilitators: crew, openFacilitation: false });
  mockFindUser.mockResolvedValue({ id: HUMAN_ID, username: "landon" });
});

describe("GET /api/v1/boards/:id/facilitators (API-015)", () => {
  it("lists the owner and facilitators for a facilitator", async () => {
    const { loader } = await import("./board.facilitators");
    const res = await call(loader, req("GET"), { id: "board-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ facilitators: crew, openFacilitation: false });
  });

  it("403 when the caller cannot facilitate", async () => {
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    const { loader } = await import("./board.facilitators");
    expect((await call(loader, req("GET"), { id: "board-1" })).status).toBe(403);
  });

  it("403 for a key from another crew on a members-only board, even with open facilitation", async () => {
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: false });
    const { loader } = await import("./board.facilitators");
    expect((await call(loader, req("GET"), { id: "board-1" })).status).toBe(403);
    expect(mockUserCanFacilitate).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/boards/:id/facilitators (API-016)", () => {
  it("grants a registered user by username and returns the list", async () => {
    const { action } = await import("./board.facilitators");
    const res = await call(action, req("POST", BASE, { username: " landon " }), { id: "board-1" });
    expect(res.status).toBe(201);
    expect(mockFindUser).toHaveBeenCalledWith("landon");
    expect(mockAdd).toHaveBeenCalledWith("board-1", HUMAN_ID);
    expect(await res.json()).toEqual({ facilitators: crew, openFacilitation: false });
  });

  it("is not lock-gated, like DECK-020", async () => {
    const { action } = await import("./board.facilitators");
    await call(action, req("POST", BASE, { username: "landon" }), { id: "board-1" });
    expect(mockLockReason).not.toHaveBeenCalled();
  });

  it("404 when no registered user has that username", async () => {
    mockFindUser.mockResolvedValueOnce(null);
    const { action } = await import("./board.facilitators");
    const res = await call(action, req("POST", BASE, { username: "ghost" }), { id: "board-1" });
    expect(res.status).toBe(404);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ username: "  " }], [{ username: 9 }]])("400 for %j", async (body) => {
    const { action } = await import("./board.facilitators");
    expect((await call(action, req("POST", BASE, body), { id: "board-1" })).status).toBe(400);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("403 when the caller cannot facilitate", async () => {
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    const { action } = await import("./board.facilitators");
    expect((await call(action, req("POST", BASE, { username: "landon" }), { id: "board-1" })).status).toBe(403);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("401 without credentials", async () => {
    mockGetApiUser.mockResolvedValueOnce(null);
    const { action } = await import("./board.facilitators");
    expect((await call(action, req("POST", BASE, { username: "landon" }), { id: "board-1" })).status).toBe(401);
  });

  it("405 for other methods", async () => {
    const { action } = await import("./board.facilitators");
    expect((await call(action, req("PATCH", BASE, {}), { id: "board-1" })).status).toBe(405);
  });
});
