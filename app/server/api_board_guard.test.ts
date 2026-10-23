// app/server/api_board_guard.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetApiUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  getApiUser: (...args: unknown[]) => mockGetApiUser(...args),
}));

const mockGetBoardAccess = vi.fn();
const mockUserCanFacilitate = vi.fn();
const mockLockReason = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  getBoardAccess: (...args: unknown[]) => mockGetBoardAccess(...args),
  userCanFacilitate: (...args: unknown[]) => mockUserCanFacilitate(...args),
  lockReason: (...args: unknown[]) => mockLockReason(...args),
}));

import {
  apiError, requireApiBoardAccess, requireApiFacilitator, requireApiUnlocked, readJsonObject,
} from "./api_board_guard";

const request = () => new Request("http://localhost:3000/api/v1/boards/board-1", { headers: { Authorization: "Bearer rk_live_x" } });

async function thrown(p: Promise<unknown>): Promise<{ status: number; code: string; message: string }> {
  try {
    await p;
  } catch (e) {
    if (!(e instanceof Response)) throw e;
    const body = (await e.json()) as { error: { code: string; message: string } };
    return { status: e.status, ...body.error };
  }
  throw new Error("expected a thrown Response");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetApiUser.mockResolvedValue({ id: "agent-1", username: "Timekeeper", teamId: "team-a" });
  mockGetBoardAccess.mockResolvedValue({ exists: true, allowed: true, userIsRegistered: false });
  mockUserCanFacilitate.mockResolvedValue(true);
  mockLockReason.mockResolvedValue(null);
});

describe("apiError", () => {
  it("answers in the JSON API's error shape", async () => {
    const res = apiError("NOT_FOUND", "Board not found", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Board not found" } });
  });
});

describe("requireApiBoardAccess", () => {
  it("returns the caller and checks access with the key's crew", async () => {
    const user = await requireApiBoardAccess(request(), "board-1");
    expect(user).toEqual({ id: "agent-1", username: "Timekeeper", teamId: "team-a" });
    expect(mockGetBoardAccess).toHaveBeenCalledWith("board-1", "agent-1", "team-a");
  });

  it("passes a null crew for a caller without a key", async () => {
    mockGetApiUser.mockResolvedValueOnce({ id: "human-1", username: "landon" });
    await requireApiBoardAccess(request(), "board-1");
    expect(mockGetBoardAccess).toHaveBeenCalledWith("board-1", "human-1", null);
  });

  it("401 UNAUTHORIZED without credentials", async () => {
    mockGetApiUser.mockResolvedValueOnce(null);
    expect(await thrown(requireApiBoardAccess(request(), "board-1"))).toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(mockGetBoardAccess).not.toHaveBeenCalled();
  });

  it("404 NOT_FOUND for a missing board", async () => {
    mockGetBoardAccess.mockResolvedValueOnce({ exists: false, allowed: false, userIsRegistered: false });
    expect(await thrown(requireApiBoardAccess(request(), "board-1"))).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("403 FORBIDDEN for a key from another crew on a members-only board", async () => {
    mockGetBoardAccess.mockResolvedValueOnce({ exists: true, allowed: false, userIsRegistered: false });
    expect(await thrown(requireApiBoardAccess(request(), "board-1"))).toEqual({
      status: 403, code: "FORBIDDEN", message: "This board is restricted to its crew",
    });
  });
});

describe("requireApiFacilitator", () => {
  it("passes a caller who can facilitate", async () => {
    await expect(requireApiFacilitator({ id: "agent-1" }, "board-1")).resolves.toBeUndefined();
    expect(mockUserCanFacilitate).toHaveBeenCalledWith("agent-1", "board-1");
  });

  it("403 FORBIDDEN otherwise", async () => {
    mockUserCanFacilitate.mockResolvedValueOnce(false);
    expect(await thrown(requireApiFacilitator({ id: "agent-1" }, "board-1"))).toEqual({
      status: 403, code: "FORBIDDEN", message: "Caller cannot facilitate this board",
    });
  });
});

describe("requireApiUnlocked", () => {
  it("passes an unlocked board, forwarding the lock flags", async () => {
    await expect(requireApiUnlocked("board-1", { notes: true })).resolves.toBeUndefined();
    expect(mockLockReason).toHaveBeenCalledWith("board-1", { notes: true });
  });

  it("423 LOCKED with the lock's reason", async () => {
    mockLockReason.mockResolvedValueOnce("Notes are locked");
    expect(await thrown(requireApiUnlocked("board-1", { notes: true }))).toEqual({
      status: 423, code: "LOCKED", message: "Notes are locked",
    });
  });
});

describe("readJsonObject", () => {
  const body = (raw: string) => new Request("http://x", { method: "PATCH", body: raw });

  it("returns a JSON object body", async () => {
    expect(await readJsonObject(body('{"title":"x"}'))).toEqual({ title: "x" });
  });

  it.each(["not json", "[1,2]", "null", '"text"'])("400 BAD_REQUEST for %s", async (raw) => {
    expect(await thrown(readJsonObject(body(raw)))).toMatchObject({ status: 400, code: "BAD_REQUEST" });
  });
});
