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
vi.mock("~/server/db_config", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRegisteredUser.mockResolvedValue({ id: "human-1", username: "landon" });
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
  it("claims an ownerless board and inserts the caller as owner", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: null }] });
    mockPoolQuery.mockResolvedValueOnce({});

    const result = (await action({
      request: claimRequest("http://localhost:3000/app/board/board-1"),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };

    expect(result.success).toBe(true);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    const insertCall = mockPoolQuery.mock.calls[1];
    expect(insertCall[0]).toContain("INSERT INTO board_members");
    expect(insertCall[0]).toContain("'owner'");
    expect(insertCall[1]).toEqual(["board-1", "human-1"]);
  });

  // This is the exact case GAP-002 fixed: a trial board's created_by is the
  // agent that made it, not the human claiming it. That must not block the claim.
  it("claims a board whose created_by is an agent, as long as it has no owner row", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: null }] });
    mockPoolQuery.mockResolvedValueOnce({});

    const result = (await action({
      request: claimRequest("http://localhost:3000/app/board/agent-board-9"),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };

    expect(result.success).toBe(true);
  });

  it("refuses to claim a board that already has an owner", async () => {
    const { action } = await import("./board.claim");
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ owner_id: "existing-owner" }] });

    const result = (await action({
      request: claimRequest("http://localhost:3000/app/board/board-1"),
      params: {},
      context: {},
    } as never)) as { success?: boolean; error?: string };

    expect(result.error).toBe("This board already has an owner and cannot be claimed.");
    // Only the ownership lookup — no INSERT attempted.
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
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
