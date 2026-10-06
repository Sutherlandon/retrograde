// app/server/growth_model.test.ts
// Growth events record the board calls to action and what they lead to, in
// growth_events (durable) and as a [METRIC] line. Recording must never break
// the page or action it rides on.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  mockPoolQuery.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("recordGrowthEvent", () => {
  it("inserts a growth_events row with the event, boards and user", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { recordGrowthEvent } = await import("./growth_model");

    await recordGrowthEvent("invite_board_created", { boardId: "board-1", resultBoardId: "board-2", userId: "user-1" });

    const [sql, params] = mockPoolQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO growth_events (event, board_id, result_board_id, user_id)");
    expect(params).toEqual(["invite_board_created", "board-1", "board-2", "user-1"]);
  });

  it("stores nulls for details it was not given", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { recordGrowthEvent } = await import("./growth_model");

    await recordGrowthEvent("keep_click");

    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["keep_click", null, null, null]);
  });

  it("prints a [METRIC] line with only the details it has", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { recordGrowthEvent } = await import("./growth_model");

    await recordGrowthEvent("keep_click", { boardId: "board-1" });

    expect(log).toHaveBeenCalledWith("[METRIC] Growth Event - event=keep_click boardId=board-1");
  });

  it("logs a failed insert as an error instead of throwing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPoolQuery.mockRejectedValueOnce(new Error("connection lost"));
    const { recordGrowthEvent } = await import("./growth_model");

    await expect(recordGrowthEvent("invite_click", { boardId: "board-1" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[ERROR] growth_events insert:", expect.any(Error));
  });
});

describe("boardIdFromParam", () => {
  it("accepts a board id and rejects anything else", async () => {
    const { boardIdFromParam } = await import("./growth_model");

    expect(boardIdFromParam("c0706d3a-9fb0-4e01-9a7d-4deb52da825a")).toBe("c0706d3a-9fb0-4e01-9a7d-4deb52da825a");
    expect(boardIdFromParam("example-board")).toBe("example-board");
    expect(boardIdFromParam(null)).toBeNull();
    expect(boardIdFromParam("")).toBeNull();
    expect(boardIdFromParam("x'; DROP TABLE boards;--")).toBeNull();
    expect(boardIdFromParam("a".repeat(65))).toBeNull();
  });
});

describe("boardIdFromReturnTo", () => {
  it("reads the board id from a board path and nothing else", async () => {
    const { boardIdFromReturnTo } = await import("./growth_model");

    expect(boardIdFromReturnTo("/app/board/board-1")).toBe("board-1");
    expect(boardIdFromReturnTo("/app/dashboard")).toBeNull();
    expect(boardIdFromReturnTo("https://elsewhere.example/app/board/board-1")).toBeNull();
    expect(boardIdFromReturnTo(null)).toBeNull();
  });
});
