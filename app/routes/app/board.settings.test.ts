import { describe, it, expect, vi, beforeEach } from "vitest";

// Track session data across mock calls
let sessionData: Record<string, string> = {};

vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({
    get: (key: string) => sessionData[key],
    set: (key: string, value: string) => { sessionData[key] = value; },
    unset: (key: string) => { delete sessionData[key]; },
  })),
  commitSession: vi.fn(async () => "session-cookie-value"),
}));

const mockPoolQuery = vi.fn();
vi.mock("~/server/db_config", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
  },
}));

vi.mock("~/config/siteConfig", () => ({
  siteConfig: { usernameField: "preferred_username" },
}));

const mockUpdateSettings = vi.fn();
const mockClearVotes = vi.fn();
const mockGetBoard = vi.fn();

vi.mock("~/server/board_model", () => ({
  updateBoardSettingsServer: (...args: unknown[]) => mockUpdateSettings(...args),
  clearBoardVotesServer: (...args: unknown[]) => mockClearVotes(...args),
  getBoardServer: (...args: unknown[]) => mockGetBoard(...args),
}));

vi.mock("~/server/db_init", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionData = {};
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockUpdateSettings.mockResolvedValue({ ok: true });
  mockGetBoard.mockResolvedValue({ id: "board-1" });
});

function makePatchRequest(boardId: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return new Request(`http://localhost:3000/app/board/${boardId}/settings`, {
    method: "PATCH",
    body: form,
  });
}

function setupUserAndOwnership(userId: string, isAnonymous: boolean, isOwner: boolean) {
  sessionData["userId"] = userId;
  // getOptionalUser SELECT
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ id: userId, preferred_username: isAnonymous ? "Guest" : "realuser", is_anonymous: isAnonymous }],
    rowCount: 1,
  });
  // requireOwner board_members SELECT
  if (isOwner) {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ role: "owner" }], rowCount: 1 });
  } else {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
  }
}

describe("board.settings action", () => {
  describe("PATCH (update settings)", () => {
    it("allows anonymous board owner to update settings", async () => {
      const { action } = await import("./board.settings");
      setupUserAndOwnership("anon-user-1", true, true);

      const request = makePatchRequest("board-1", {
        votingEnabled: "true",
        votingAllowed: "3",
        notesLocked: "false",
        boardLocked: "false",
      });

      await action({ request, params: { id: "board-1" }, context: {} });
      expect(mockUpdateSettings).toHaveBeenCalledWith("board-1", {
        votingEnabled: true,
        votingAllowed: 3,
        notesLocked: false,
        boardLocked: false,
      });
    });

    it("allows registered board owner to update settings", async () => {
      const { action } = await import("./board.settings");
      setupUserAndOwnership("user-1", false, true);

      const request = makePatchRequest("board-1", {
        votingEnabled: "false",
        votingAllowed: "5",
        notesLocked: "true",
        boardLocked: "false",
      });

      await action({ request, params: { id: "board-1" }, context: {} });
      expect(mockUpdateSettings).toHaveBeenCalled();
    });

    it("returns 403 for anonymous non-owner", async () => {
      const { action } = await import("./board.settings");
      setupUserAndOwnership("anon-user-2", true, false);

      const request = makePatchRequest("board-1", {
        votingEnabled: "true",
        votingAllowed: "3",
        notesLocked: "false",
        boardLocked: "false",
      });

      try {
        await action({ request, params: { id: "board-1" }, context: {} });
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        const res = response as Response;
        expect(res.status).toBe(403);
      }
    });

    it("returns 401 when no user session exists", async () => {
      const { action } = await import("./board.settings");

      const request = makePatchRequest("board-1", {
        votingEnabled: "true",
        votingAllowed: "3",
        notesLocked: "false",
        boardLocked: "false",
      });

      try {
        await action({ request, params: { id: "board-1" }, context: {} });
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        const res = response as Response;
        expect(res.status).toBe(401);
      }
    });
  });

  describe("POST (clear votes)", () => {
    it("allows anonymous owner to clear votes", async () => {
      const { action } = await import("./board.settings");
      setupUserAndOwnership("anon-user-1", true, true);

      const form = new FormData();
      const request = new Request("http://localhost:3000/app/board/board-1/settings", {
        method: "POST",
        body: form,
      });

      await action({ request, params: { id: "board-1" }, context: {} });
      expect(mockClearVotes).toHaveBeenCalledWith("board-1");
      expect(mockGetBoard).toHaveBeenCalledWith("board-1");
    });
  });
});
