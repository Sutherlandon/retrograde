import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireBoardAccess = vi.fn();
vi.mock("~/server/board_permissions", () => ({
  requireBoardAccess: (...args: unknown[]) => mockRequireBoardAccess(...args),
}));

const mockStartTimer = vi.fn();
const mockStopTimer = vi.fn();
vi.mock("~/server/board_model", () => ({
  startTimerServer: (...args: unknown[]) => mockStartTimer(...args),
  stopTimerServer: (...args: unknown[]) => mockStopTimer(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireBoardAccess.mockResolvedValue({ id: "user-1" });
  mockStartTimer.mockResolvedValue(undefined);
  mockStopTimer.mockResolvedValue(undefined);
});

function request(method: string, fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/board/board-1/timer", { method, body: form });
}

describe("board.timer action", () => {
  it("checks board access before starting the timer", async () => {
    const { action } = await import("./board.timer");
    await action({
      request: request("POST", { seconds: "300" }),
      params: { id: "board-1" },
      context: {},
    } as never);

    expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.any(Request), "board-1");
    expect(mockStartTimer).toHaveBeenCalledWith("board-1", 300);
  });

  it("checks board access before stopping the timer", async () => {
    const { action } = await import("./board.timer");
    await action({ request: request("DELETE"), params: { id: "board-1" }, context: {} } as never);
    expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.any(Request), "board-1");
    expect(mockStopTimer).toHaveBeenCalledWith("board-1");
  });

  it("propagates the access check's rejection and never starts the timer", async () => {
    const { action } = await import("./board.timer");
    mockRequireBoardAccess.mockRejectedValueOnce(
      new Response("This board is restricted to its crew", { status: 403 })
    );

    try {
      await action({
        request: request("POST", { seconds: "300" }),
        params: { id: "board-1" },
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockStartTimer).not.toHaveBeenCalled();
  });
});
