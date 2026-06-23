import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: vi.fn(async () => ({
      query: mockClientQuery,
      release: mockRelease,
    })),
  },
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensurePersonalTeam", () => {
  it("returns the existing team id when the user already has a personal team", async () => {
    const { ensurePersonalTeam } = await import("./team_model");

    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ team_id: "team-existing" }],
    });

    const id = await ensurePersonalTeam("user-1", "landon");

    expect(id).toBe("team-existing");
    // No transaction opened
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("creates a new team + membership when none exists", async () => {
    const { ensurePersonalTeam } = await import("./team_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // no existing

    mockClientQuery.mockResolvedValueOnce({}); // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: "team-new" }] }); // INSERT team
    mockClientQuery.mockResolvedValueOnce({}); // INSERT member
    mockClientQuery.mockResolvedValueOnce({}); // COMMIT

    const id = await ensurePersonalTeam("user-2", "landon");

    expect(id).toBe("team-new");
    expect(mockClientQuery.mock.calls[1][0]).toContain("INSERT INTO teams");
    expect(mockClientQuery.mock.calls[1][1]).toEqual(["landon's Team"]);
    expect(mockClientQuery.mock.calls[2][0]).toContain("INSERT INTO team_members");
    expect(mockClientQuery.mock.calls[2][1]).toEqual(["team-new", "user-2"]);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("rolls back on insertion failure", async () => {
    const { ensurePersonalTeam } = await import("./team_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    mockClientQuery.mockResolvedValueOnce({}); // BEGIN
    mockClientQuery.mockRejectedValueOnce(new Error("dup key"));
    mockClientQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      ensurePersonalTeam("user-3", "landon")
    ).rejects.toThrow("dup key");

    expect(mockClientQuery.mock.calls.some((c) => c[0] === "ROLLBACK")).toBe(true);
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("getPersonalTeamForUser", () => {
  it("returns the team DTO when one exists", async () => {
    const { getPersonalTeamForUser } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        { id: "t-1", name: "landon's Team", is_personal: true, created_at: "2026-06-22T00:00:00Z" },
      ],
    });
    const team = await getPersonalTeamForUser("u-1");
    expect(team).toEqual({
      id: "t-1",
      name: "landon's Team",
      is_personal: true,
      created_at: "2026-06-22T00:00:00Z",
    });
  });

  it("returns null when the user has no personal team", async () => {
    const { getPersonalTeamForUser } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const team = await getPersonalTeamForUser("u-2");
    expect(team).toBeNull();
  });
});

describe("userIsTeamMember", () => {
  it("returns true when the user belongs to the team", async () => {
    const { userIsTeamMember } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{}] });
    expect(await userIsTeamMember("u", "t")).toBe(true);
  });

  it("returns false when no membership row exists", async () => {
    const { userIsTeamMember } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await userIsTeamMember("u", "t")).toBe(false);
  });
});
