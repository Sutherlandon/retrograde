// app/routes/app/board.claim.test.ts
// DASH-016 / BRD-020: claiming an ownerless board. GAP-002's claim predicate
// is "does an owner row exist" — created_by (attribution) no longer matters,
// because the API trial path stamps created_by with the agent, and that
// board must still be claimable.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRegisteredUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  requireRegisteredUser: (...args: unknown[]) => mockRequireRegisteredUser(...args),
}));

const mockPoolQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn(async () => ({ query: mockClientQuery, release: mockRelease }));
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: mockConnect,
  },
}));

const mockEnsurePersonalTeam = vi.fn();
vi.mock("~/server/team_model", () => ({
  ensurePersonalTeam: (...args: unknown[]) => mockEnsurePersonalTeam(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRegisteredUser.mockResolvedValue({ id: "human-1", username: "landon" });
  mockEnsurePersonalTeam.mockResolvedValue("personal-team-1");
  mockClientQuery.mockResolvedValue({});
});

function claimRequest(boardLink: string) {
  const form = new FormData();
  form.append("boardLink", boardLink);
  return new Request("http://localhost:3000/app/board/claim", {
    method: "POST",
    body: form,
  });
}

describe("board.claim action (DASH-016)", () => {
  it("claims an ownerless board, inserts the caller as owner, and sets team_id to their personal crew (BRD-020)", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: null }] });
    mockEnsurePersonalTeam.mockResolvedValueOnce("personal-team-1");

    const result = (await action({
      request: claimRequest("http://localhost:3000/app/board/board-1"),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(mockEnsurePersonalTeam).toHaveBeenCalledWith("human-1");
    expect(mockConnect).toHaveBeenCalledTimes(1);

    const calls = mockClientQuery.mock.calls;
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1][0]).toContain("INSERT INTO board_members");
    expect(calls[1][0]).toContain("'owner'");
    expect(calls[1][1]).toEqual(["board-1", "human-1"]);
    expect(calls[2][0]).toContain("UPDATE boards");
    expect(calls[2][0]).toContain("team_id");
    expect(calls[2][1]).toEqual(["personal-team-1", "board-1"]);
    expect(calls[3][0]).toBe("COMMIT");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  // BRD-020: a claim must not yank the Command Deck away from everyone
  // mid-retro — open_facilitation is a deliberate exception to the
  // crewless->crew transition that moveBoardsToTeamServer otherwise applies.
  it("does not touch open_facilitation when claiming (BRD-020)", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: null }] });

    await action({
      request: claimRequest("http://localhost:3000/app/board/board-1"),
      params: {},
      context: {},
    } as never);

    for (const call of mockClientQuery.mock.calls) {
      expect(String(call[0])).not.toMatch(/open_facilitation/i);
    }
  });

  // This is the exact case GAP-002 fixed: a trial board's created_by is the
  // agent that made it, not the human claiming it. That must not block the claim.
  it("claims a board whose created_by is an agent, as long as it has no owner row", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: null }] });

    const result = (await action({
      request: claimRequest("http://localhost:3000/app/board/agent-board-9"),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };

    expect(result.success).toBe(true);
  });

  it("refuses to claim a board that already has an owner, and writes nothing (BRD-020)", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: "existing-owner" }] });

    const result = (await action({
      request: claimRequest("http://localhost:3000/app/board/board-1"),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };

    expect(result.error).toBe("This board already has an owner and cannot be claimed.");
    // Only the ownership lookup — no crew lookup, no transaction.
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockEnsurePersonalTeam).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("rolls back the transaction if the owner insert fails (DASH-016)", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: null }] });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error("insert failed")) // INSERT INTO board_members
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      action({
        request: claimRequest("http://localhost:3000/app/board/board-1"),
        params: {},
        context: {},
      } as never)
    ).rejects.toThrow("insert failed");

    const calls = mockClientQuery.mock.calls;
    expect(calls[calls.length - 1][0]).toBe("ROLLBACK");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("rolls back the transaction if the team_id update fails (DASH-016)", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: null }] });
    mockClientQuery
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({}) // INSERT INTO board_members
      .mockRejectedValueOnce(new Error("update failed")) // UPDATE boards SET team_id
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      action({
        request: claimRequest("http://localhost:3000/app/board/board-1"),
        params: {},
        context: {},
      } as never)
    ).rejects.toThrow("update failed");

    const calls = mockClientQuery.mock.calls;
    expect(calls[calls.length - 1][0]).toBe("ROLLBACK");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("propagates whatever requireRegisteredUser throws for an unregistered caller", async () => {
    const { action } = await import("./board.claim");
    mockRequireRegisteredUser.mockRejectedValueOnce(
      new Response(null, { status: 302, headers: { Location: "/auth/login?returnTo=%2Fapp%2Fboard%2Fclaim" } })
    );

    try {
      await action({
        request: claimRequest("http://localhost:3000/app/board/board-1"),
        params: {},
        context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(302);
    }
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("returns an error for a link that doesn't contain a board id", async () => {
    const { action } = await import("./board.claim");

    const result = (await action({
      request: claimRequest("not a board link"),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };

    expect(result.error).toBe("Invalid board link. Please check the URL and try again.");
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("returns an error when the board doesn't exist", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = (await action({
      request: claimRequest("http://localhost:3000/app/board/ghost-board"),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };

    expect(result.error).toBe("Board not found.");
  });
});
