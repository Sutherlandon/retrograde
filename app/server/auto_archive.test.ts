import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
const hosting = vi.hoisted(() => ({ selfHosted: false }));
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  get selfHosted() {
    return hosting.selfHosted;
  },
}));
vi.mock("~/server/db_init", () => ({}));
vi.mock("~/config/grandfather", () => ({
  GRANDFATHER_CUTOFF: "2026-10-01T00:00:00Z",
  FREE_TIER_TTL_DAYS: 30,
}));

beforeEach(() => {
  vi.clearAllMocks();
  hosting.selfHosted = false;
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
    expect(call[1]).toEqual(["2026-10-01T00:00:00Z", "30"]);
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

// The date a guest sees on the board must follow the same rule archiveStaleBoards
// applies: crewless, not yet archived, created after the cutoff, TTL days on.
describe("archiveDateFor", () => {
  const guestBoard = { team_id: null, createdAt: "2026-10-05T14:30:00Z", archivedAt: null };

  it("is TTL days after creation for a crewless board made after the cutoff", async () => {
    const { archiveDateFor } = await import("./auto_archive");
    expect(archiveDateFor(guestBoard)).toBe("2026-11-04T14:30:00.000Z");
  });

  it("is null for a board on a crew, which is never archived", async () => {
    const { archiveDateFor } = await import("./auto_archive");
    expect(archiveDateFor({ ...guestBoard, team_id: "team-1" })).toBeNull();
  });

  it("is null for a board created before the cutoff, which is grandfathered (ADR-0019)", async () => {
    const { archiveDateFor } = await import("./auto_archive");
    expect(archiveDateFor({ ...guestBoard, createdAt: "2026-09-30T23:59:59Z" })).toBeNull();
  });

  it("is null for a board already archived", async () => {
    const { archiveDateFor } = await import("./auto_archive");
    expect(archiveDateFor({ ...guestBoard, archivedAt: "2026-11-05T03:00:00Z" })).toBeNull();
  });

  it("is null without a creation time, as on the static example boards", async () => {
    const { archiveDateFor } = await import("./auto_archive");
    expect(archiveDateFor({ team_id: null })).toBeNull();
  });

  it("is null on a self-hosted instance, which runs no scheduled cleanup (ADR-0020)", async () => {
    hosting.selfHosted = true;
    const { archiveDateFor } = await import("./auto_archive");
    expect(archiveDateFor(guestBoard)).toBeNull();
  });
});
