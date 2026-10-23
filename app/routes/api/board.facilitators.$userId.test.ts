// app/routes/api/board.facilitators.$userId.test.ts
// DELETE /api/v1/boards/:id/facilitators/:userId — API-017.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetFacilitators = vi.fn();
const mockRemove = vi.fn();
vi.mock("~/server/board_model", () => ({
  getFacilitatorsServer: (...a: unknown[]) => mockGetFacilitators(...a),
  removeFacilitatorServer: (...a: unknown[]) => mockRemove(...a),
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
  mockRemove.mockResolvedValue(true);
});

describe("DELETE /api/v1/boards/:id/facilitators/:userId (API-017)", () => {
  const url = `${BASE}/${HUMAN_ID}`;

  it("revokes a facilitator and returns the list", async () => {
    const { action } = await import("./board.facilitators.$userId");
    const res = await call(action, req("DELETE", url), { id: "board-1", userId: HUMAN_ID });
    expect(res.status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith("board-1", HUMAN_ID);
    expect(await res.json()).toEqual({ facilitators: crew, openFacilitation: false });
  });

  it("404 when that user holds no facilitator grant — the owner can never be removed", async () => {
    mockRemove.mockResolvedValueOnce(false);
    const { action } = await import("./board.facilitators.$userId");
    const res = await call(action, req("DELETE", url), { id: "board-1", userId: HUMAN_ID });
    expect(res.status).toBe(404);
  });

  it("404 for an id that isn't a user id, without querying", async () => {
    const { action } = await import("./board.facilitators.$userId");
    const res = await call(action, req("DELETE", `${BASE}/nope`), { id: "board-1", userId: "nope" });
    expect(res.status).toBe(404);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("403 when the caller cannot facilitate", async () => {
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    const { action } = await import("./board.facilitators.$userId");
    expect((await call(action, req("DELETE", url), { id: "board-1", userId: HUMAN_ID })).status).toBe(403);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("405 for other methods", async () => {
    const { action, loader } = await import("./board.facilitators.$userId");
    expect((await call(action, req("POST", url, {}), { id: "board-1", userId: HUMAN_ID })).status).toBe(405);
    expect((loader() as Response).status).toBe(405);
  });
});
