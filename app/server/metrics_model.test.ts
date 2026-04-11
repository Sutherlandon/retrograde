import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMetrics", () => {
  it("returns all four counts from the database", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        registeredUsers: 42,
        totalNotes: 300,
        activeBoards: 15,
        engagedUsers: 28,
      }],
    });

    const { getMetrics } = await import("./metrics_model");
    const result = await getMetrics();

    expect(result).toEqual({
      registeredUsers: 42,
      totalNotes: 300,
      activeBoards: 15,
      engagedUsers: 28,
    });
  });

  it("issues a single query using the active_boards CTE", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ registeredUsers: 0, totalNotes: 0, activeBoards: 0, engagedUsers: 0 }],
    });

    const { getMetrics } = await import("./metrics_model");
    await getMetrics();

    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockPoolQuery.mock.calls[0] as [string];
    expect(sql).toContain("active_boards");
    expect(sql).toContain("registeredUsers");
    expect(sql).toContain("totalNotes");
    expect(sql).toContain("activeBoards");
    expect(sql).toContain("engagedUsers");
  });

  it("active boards CTE requires board owner to be set", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ registeredUsers: 0, totalNotes: 0, activeBoards: 0, engagedUsers: 0 }],
    });

    const { getMetrics } = await import("./metrics_model");
    await getMetrics();

    const [sql] = mockPoolQuery.mock.calls[0] as [string];
    expect(sql).toContain("created_by IS NOT NULL");
  });

  it("active boards CTE counts 5+ owner notes as the threshold", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ registeredUsers: 0, totalNotes: 0, activeBoards: 0, engagedUsers: 0 }],
    });

    const { getMetrics } = await import("./metrics_model");
    await getMetrics();

    const [sql] = mockPoolQuery.mock.calls[0] as [string];
    expect(sql).toContain(">= 5");
  });

  it("returns zeros when the database is empty", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ registeredUsers: 0, totalNotes: 0, activeBoards: 0, engagedUsers: 0 }],
    });

    const { getMetrics } = await import("./metrics_model");
    const result = await getMetrics();

    expect(result.registeredUsers).toBe(0);
    expect(result.totalNotes).toBe(0);
    expect(result.activeBoards).toBe(0);
    expect(result.engagedUsers).toBe(0);
  });
});
