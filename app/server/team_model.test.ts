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

    const id = await ensurePersonalTeam("user-1");

    expect(id).toBe("team-existing");
    // No transaction opened
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("creates a new team named 'Personal' + membership when none exists", async () => {
    const { ensurePersonalTeam } = await import("./team_model");

    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // no existing

    mockClientQuery.mockResolvedValueOnce({}); // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: "team-new" }] }); // INSERT team
    mockClientQuery.mockResolvedValueOnce({}); // INSERT member
    mockClientQuery.mockResolvedValueOnce({}); // COMMIT

    const id = await ensurePersonalTeam("user-2");

    expect(id).toBe("team-new");
    expect(mockClientQuery.mock.calls[1][0]).toContain("INSERT INTO teams");
    expect(mockClientQuery.mock.calls[1][1]).toEqual(["Personal"]);
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
      ensurePersonalTeam("user-3")
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

describe("createTeam", () => {
  it("creates a non-personal team with the creator as owner", async () => {
    const { createTeam } = await import("./team_model");
    mockClientQuery.mockResolvedValueOnce({}); // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [{ id: "team-9" }] }); // INSERT team
    mockClientQuery.mockResolvedValueOnce({}); // INSERT member
    mockClientQuery.mockResolvedValueOnce({}); // COMMIT

    const id = await createTeam("Voyager Crew", "user-1");
    expect(id).toBe("team-9");
    expect(mockClientQuery.mock.calls[1][0]).toContain("FALSE");
    expect(mockClientQuery.mock.calls[1][1]).toEqual(["Voyager Crew"]);
    expect(mockClientQuery.mock.calls[2][0]).toContain("'owner'");
  });
});

describe("team membership management", () => {
  it("addTeamMember inserts role member idempotently", async () => {
    const { addTeamMember } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({});
    await addTeamMember("team-1", "user-3");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("'member'");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("ON CONFLICT");
  });

  it("removeTeamMember never removes an owner", async () => {
    const { removeTeamMember } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({});
    await removeTeamMember("team-1", "user-3");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("role <> 'owner'");
  });

  it("teamRole returns the role or null", async () => {
    const { teamRole } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ role: "member" }] });
    expect(await teamRole("team-1", "user-3")).toBe("member");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await teamRole("team-1", "stranger")).toBeNull();
  });
});

describe("team lifecycle guards", () => {
  it("renameTeam only touches non-personal teams", async () => {
    const { renameTeam } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({});
    await renameTeam("team-1", "New Name");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("is_personal = FALSE");
  });

  it("deleteTeamServer only deletes non-personal teams", async () => {
    const { deleteTeamServer } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({});
    await deleteTeamServer("team-1");
    expect(mockPoolQuery.mock.calls[0][0]).toContain("is_personal = FALSE");
  });
});

describe("listTeamsForUser", () => {
  it("returns team summaries with counts", async () => {
    const { listTeamsForUser } = await import("./team_model");
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{
        id: "t1", name: "landon's Team", is_personal: true, created_at: "x",
        role: "owner", member_count: 1, board_count: 3, open_action_items: 2,
      }],
    });
    const teams = await listTeamsForUser("user-1");
    expect(teams[0].member_count).toBe(1);
    const sql = mockPoolQuery.mock.calls[0][0] as string;
    expect(sql).toContain("member_count");
    expect(sql).toContain("open_action_items");
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
