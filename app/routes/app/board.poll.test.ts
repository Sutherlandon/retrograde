// routes/app/board.poll.test.ts
// The ?v= contract of the poll (ADR-0029).
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveBoardAccess = vi.fn();
const mockGetBoardSnapshot = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  resolveBoardAccess: (...args: unknown[]) => mockResolveBoardAccess(...args),
}));
vi.mock("~/server/board_snapshot", () => ({
  getBoardSnapshot: (...args: unknown[]) => mockGetBoardSnapshot(...args),
}));

import { loader } from "./board.poll";

const SNAPSHOT = { id: "b", version: 5 };

function call(query = "") {
  return loader({
    request: new Request(`http://x/app/board/b/poll${query}`),
    params: { id: "b" },
    context: {},
  } as never);
}

async function thrown(p: Promise<unknown>): Promise<Response> {
  try { await p; } catch (e) { return e as Response; }
  throw new Error("expected a throw");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveBoardAccess.mockResolvedValue({
    user: { id: "u1" },
    access: { exists: true, allowed: true, userIsRegistered: true, version: 5, timerExpired: false },
  });
  mockGetBoardSnapshot.mockResolvedValue(SNAPSHOT);
});

describe("board poll loader", () => {
  it("returns the snapshot when no v is sent", async () => {
    const res = (await call()) as Response;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SNAPSHOT);
    expect(mockGetBoardSnapshot).toHaveBeenCalledWith("b", "u1");
  });

  it("returns 204 with an empty body, without building the snapshot, when v matches", async () => {
    const res = (await call("?v=5")) as Response;
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(mockGetBoardSnapshot).not.toHaveBeenCalled();
  });

  it("returns the snapshot when the client is behind", async () => {
    const res = (await call("?v=4")) as Response;
    expect(res.status).toBe(200);
    expect(mockGetBoardSnapshot).toHaveBeenCalledTimes(1);
  });

  it("returns the snapshot when v matches but a running timer has run out", async () => {
    mockResolveBoardAccess.mockResolvedValue({
      user: { id: "u1" },
      access: { exists: true, allowed: true, userIsRegistered: true, version: 5, timerExpired: true },
    });
    const res = (await call("?v=5")) as Response;
    expect(res.status).toBe(200);
    expect(mockGetBoardSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each(["abc", "-1", "1.5", "", "5x", "%205"])("treats malformed v=%j as absent", async (v) => {
    const res = (await call(`?v=${v}`)) as Response;
    expect(res.status).toBe(200);
    expect(mockGetBoardSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])("still throws %i with a matching v", async (status) => {
    mockResolveBoardAccess.mockRejectedValue(new Response("no", { status }));
    const res = await thrown(call("?v=5"));
    expect(res.status).toBe(status);
    expect(mockGetBoardSnapshot).not.toHaveBeenCalled();
  });

  it("404s when the snapshot cannot be built", async () => {
    mockGetBoardSnapshot.mockResolvedValue(null);
    expect((await thrown(call())).status).toBe(404);
  });
});
