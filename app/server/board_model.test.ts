import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: vi.fn(async () => ({
      query: mockQuery,
      release: mockRelease,
    })),
  },
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("updateColumnPromptServer", () => {
  it("updates the prompt text for a column", async () => {
    const { updateColumnPromptServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({});
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await updateColumnPromptServer("board-1", "col-1", "Think about what went well");

    expect(mockPoolQuery.mock.calls[0][0]).toContain("UPDATE columns SET prompt");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["Think about what went well", "col-1"]);
  });

  it("allows clearing the prompt to an empty string", async () => {
    const { updateColumnPromptServer } = await import("./board_model");

    mockPoolQuery.mockResolvedValueOnce({});
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ board: { id: "board-1", columns: [] } }] });

    await updateColumnPromptServer("board-1", "col-1", "");

    expect(mockPoolQuery.mock.calls[0][1]).toEqual(["", "col-1"]);
  });
});
