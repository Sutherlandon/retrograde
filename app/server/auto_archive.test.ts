import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));
vi.mock("~/server/db_init", () => ({}));
vi.mock("~/config/grandfather", () => ({
  GRANDFATHER_CUTOFF: "2026-06-22T00:00:00Z",
  FREE_TIER_TTL_DAYS: 30,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("archiveStaleBoards", () => {
  it("issues an UPDATE with team_id null, archived_at null, post-cutoff, older-than-TTL", async () => {
    const { archiveStaleBoards } = await import("./auto_archive");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 3 });

    const result = await archiveStaleBoards();

    expect(result.archived).toBe(3);
    const call = mockPoolQuery.mock.calls[0];
    expect(call[0]).toContain("UPDATE boards");
    expect(call[0]).toContain("archived_at = NOW()");
    expect(call[0]).toContain("team_id IS NULL");
    expect(call[0]).toContain("archived_at IS NULL");
    expect(call[0]).toContain("created_at >");
    expect(call[0]).toContain("created_at <");
    expect(call[1]).toEqual(["2026-06-22T00:00:00Z", "30"]);
  });

  it("returns 0 when no rows match", async () => {
    const { archiveStaleBoards } = await import("./auto_archive");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });
    const result = await archiveStaleBoards();
    expect(result.archived).toBe(0);
  });

  it("handles a null rowCount (edge case) as 0", async () => {
    const { archiveStaleBoards } = await import("./auto_archive");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: null });
    const result = await archiveStaleBoards();
    expect(result.archived).toBe(0);
  });
});
