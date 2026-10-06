// app/server/event_model.test.ts
// The events table (ADR-0026): one append-only record of what people do,
// tagged with the registry ID of the action it belongs to. Recording must
// never break the page or action it rides on.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseRegistry } from "./registry_parser";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  mockPoolQuery.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("recordEvent", () => {
  it("inserts an events row with its name, registry ID, subjects and properties", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { recordEvent } = await import("./event_model");

    await recordEvent("invite_board_created", {
      actionId: "SITE-003",
      userId: "user-1",
      boardId: "board-2",
      teamId: "team-1",
      properties: { from_board_id: "board-1" },
    });

    const [sql, params] = mockPoolQuery.mock.calls[0];
    expect(sql).toContain("INSERT INTO events (name, action_id, user_id, board_id, team_id, properties)");
    expect(sql).toContain("$6::jsonb");
    expect(params).toEqual(["invite_board_created", "SITE-003", "user-1", "board-2", "team-1", '{"from_board_id":"board-1"}']);
  });

  it("stores nulls and empty properties for details it was not given", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { recordEvent } = await import("./event_model");

    await recordEvent("keep_click");

    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["keep_click", null, null, null, null, "{}"]);
  });

  it("prints a [METRIC] line with only the details it has", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { recordEvent } = await import("./event_model");

    await recordEvent("keep_click", { actionId: "BRD-021", boardId: "board-1" });

    expect(log).toHaveBeenCalledWith("[METRIC] Event - name=keep_click actionId=BRD-021 boardId=board-1");
  });

  it("logs a failed insert as an error instead of throwing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPoolQuery.mockRejectedValueOnce(new Error("connection lost"));
    const { recordEvent } = await import("./event_model");

    await expect(recordEvent("invite_click", { boardId: "board-1" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[ERROR] events insert:", expect.any(Error));
  });
});

// An event tagged with a registry ID that does not exist would be counted
// against no feature. Every `actionId: "XXX-NNN"` in the app must be a row.
describe("registry IDs on events", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
  }

  it("names only actions that are in the registry", () => {
    const known = new Set(parseRegistry(process.cwd()).map((row) => row.id));
    const used = sourceFiles(join(process.cwd(), "app")).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/actionId: "([A-Z]+-\d{3})"/g)].map((m) => `${m[1]} (${file})`)
    );

    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((entry) => !known.has(entry.split(" ")[0]))).toEqual([]);
  });
});

describe("boardIdFromParam", () => {
  it("accepts a board id and rejects anything else", async () => {
    const { boardIdFromParam } = await import("./event_model");

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
    const { boardIdFromReturnTo } = await import("./event_model");

    expect(boardIdFromReturnTo("/app/board/board-1")).toBe("board-1");
    expect(boardIdFromReturnTo("/app/dashboard")).toBeNull();
    expect(boardIdFromReturnTo("https://elsewhere.example/app/board/board-1")).toBeNull();
    expect(boardIdFromReturnTo(null)).toBeNull();
  });
});
