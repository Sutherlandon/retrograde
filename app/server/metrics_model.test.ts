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

  it("excludes seed boards from the notes count", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ registeredUsers: 0, totalNotes: 0, activeBoards: 0, engagedUsers: 0 }],
    });

    const { getMetrics } = await import("./metrics_model");
    await getMetrics();

    const [sql, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ALL($1)");
    expect(params[0]).toContain("dev-test");
  });
});

describe("getMetricsTrends", () => {
  const WEEK_ROWS = [
    { weekStart: "2026-06-29", newUsers: 2, newBoards: 1, newNotes: 10 },
    { weekStart: "2026-07-06", newUsers: 0, newBoards: 0, newNotes: 0 },
    { weekStart: "2026-07-13", newUsers: 3, newBoards: 2, newNotes: 7 },
  ];

  function mockTrendQueries(baselineUsers = 5) {
    mockPoolQuery.mockResolvedValueOnce({ rows: WEEK_ROWS });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: baselineUsers }] });
  }

  it("returns one point per week with cumulative registered users", async () => {
    mockTrendQueries(5);

    const { getMetricsTrends } = await import("./metrics_model");
    const result = await getMetricsTrends(3);

    expect(result).toEqual([
      { weekStart: "2026-06-29", newUsers: 2, newBoards: 1, newNotes: 10, totalUsers: 7 },
      { weekStart: "2026-07-06", newUsers: 0, newBoards: 0, newNotes: 0, totalUsers: 7 },
      { weekStart: "2026-07-13", newUsers: 3, newBoards: 2, newNotes: 7, totalUsers: 10 },
    ]);
  });

  it("defaults to a 12-week window", async () => {
    mockTrendQueries();

    const { getMetricsTrends } = await import("./metrics_model");
    await getMetricsTrends();

    const [, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(12);
  });

  it("buckets by week and zero-fills empty weeks in SQL", async () => {
    mockTrendQueries();

    const { getMetricsTrends } = await import("./metrics_model");
    await getMetricsTrends();

    const [sql] = mockPoolQuery.mock.calls[0] as [string];
    expect(sql).toContain("generate_series");
    expect(sql).toContain("date_trunc('week'");
  });

  it("counts only registered (non-anonymous) users", async () => {
    mockTrendQueries();

    const { getMetricsTrends } = await import("./metrics_model");
    await getMetricsTrends();

    const [weeklySql] = mockPoolQuery.mock.calls[0] as [string];
    const [baselineSql] = mockPoolQuery.mock.calls[1] as [string];
    expect(weeklySql).toContain("is_anonymous = FALSE");
    expect(baselineSql).toContain("is_anonymous = FALSE");
  });

  it("excludes seed boards from board and note trends", async () => {
    mockTrendQueries();

    const { getMetricsTrends } = await import("./metrics_model");
    await getMetricsTrends();

    const [, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(params[1]).toContain("dev-test");
  });

  it("only counts notes whose created value is a valid epoch-millis string", async () => {
    mockTrendQueries();

    const { getMetricsTrends } = await import("./metrics_model");
    await getMetricsTrends();

    const [sql] = mockPoolQuery.mock.calls[0] as [string];
    expect(sql).toContain("\\d{13}");
    expect(sql).toContain("to_timestamp");
  });

  it("treats a missing baseline row as zero prior users", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: WEEK_ROWS });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const { getMetricsTrends } = await import("./metrics_model");
    const result = await getMetricsTrends(3);

    expect(result[0].totalUsers).toBe(2);
    expect(result[2].totalUsers).toBe(5);
  });

  it("selects no PII columns — counts and week buckets only", async () => {
    mockTrendQueries();

    const { getMetricsTrends } = await import("./metrics_model");
    await getMetricsTrends();

    const [sql] = mockPoolQuery.mock.calls[0] as [string];
    for (const column of ["email", "name", "preferred_username", "external_id"]) {
      expect(sql).not.toContain(column);
    }
  });
});
