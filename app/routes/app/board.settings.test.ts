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
  oauthUsernameField: "preferred_username",
  selfHosted: false,
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

// Answers the guards' SQL by shape: the caller's user row, board access
// (requireBoardAccess, checked first — GAP-008's rule) and facilitation
// (requireFacilitator → userCanFacilitate, ADR-0006).
function setupUserAndOwnership(
  userId: string, isAnonymous: boolean, canFacilitate: boolean, hasAccess = true
) {
  sessionData["userId"] = userId;
  mockPoolQuery.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT * FROM users")) {
      return { rows: [{ id: userId, preferred_username: isAnonymous ? "Guest" : "realuser", is_anonymous: isAnonymous }], rowCount: 1 };
    }
    if (sql.includes("is_team_member")) {
      return {
        rows: [{ team_id: "team-1", restricted: !hasAccess, is_team_member: false, is_board_member: false, is_registered: !isAnonymous }],
        rowCount: 1,
      };
    }
    if (sql.includes("AS can")) return { rows: [{ can: canFacilitate }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
}

describe("board.settings action", () => {
  describe("PATCH (update settings)", () => {
    it("allows anonymous board owner to update settings (DECK-008, DECK-009, DECK-015, DECK-016)", async () => {
      const { action } = await import("./board.settings");
      setupUserAndOwnership("anon-user-1", true, true);

      const request = makePatchRequest("board-1", {
        votingEnabled: "true",
        votingAllowed: "3",
        notesLocked: "false",
        boardLocked: "false",
      });

      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockUpdateSettings).toHaveBeenCalledWith("board-1", {
        votingEnabled: true,
        votingAllowed: 3,
        votingScope: "board",
        notesLocked: false,
        boardLocked: false,
        attributionEnabled: false,
        actionItemsVisible: true,
        hideOthersNotes: false,
      }, "anon-user-1");
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

      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockUpdateSettings).toHaveBeenCalled();
    });

    it("parses the hideOthersNotes flag (blind brainstorm) (DECK-013)", async () => {
      const { action } = await import("./board.settings");
      setupUserAndOwnership("user-1", false, true);

      const request = makePatchRequest("board-1", {
        votingEnabled: "false",
        votingAllowed: "5",
        notesLocked: "false",
        boardLocked: "false",
        hideOthersNotes: "true",
      });

      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        "board-1",
        expect.objectContaining({ hideOthersNotes: true }),
        "user-1"
      );
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
        await action({ request, params: { id: "board-1" }, context: {} } as never);
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        const res = response as Response;
        expect(res.status).toBe(403);
      }
    });

    it("returns 401 when no user session exists", async () => {
      const { action } = await import("./board.settings");
      // An existing, open board; no session, and facilitation isn't open.
      mockPoolQuery.mockImplementation(async (sql: string) => {
        if (sql.includes("is_team_member")) {
          return { rows: [{ team_id: null, restricted: false, is_team_member: false, is_board_member: false, is_registered: false }], rowCount: 1 };
        }
        if (sql.includes("AS can")) return { rows: [{ can: false }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      });

      const request = makePatchRequest("board-1", {
        votingEnabled: "true",
        votingAllowed: "3",
        notesLocked: "false",
        boardLocked: "false",
      });

      try {
        await action({ request, params: { id: "board-1" }, context: {} } as never);
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        const res = response as Response;
        expect(res.status).toBe(401);
      }
    });
  });

  describe("POST (clear votes)", () => {
    it("allows anonymous owner to clear votes (DECK-011)", async () => {
      const { action } = await import("./board.settings");
      setupUserAndOwnership("anon-user-1", true, true);

      const form = new FormData();
      const request = new Request("http://localhost:3000/app/board/board-1/settings", {
        method: "POST",
        body: form,
      });

      await action({ request, params: { id: "board-1" }, context: {} } as never);
      expect(mockClearVotes).toHaveBeenCalledWith("board-1");
      expect(mockGetBoard).toHaveBeenCalledWith("board-1", "anon-user-1");
    });
  });
});

describe("board.settings — board access first (DECK-008–016)", () => {
  it("refuses a facilitator from outside a members-only board's crew, even with open facilitation", async () => {
    const { action } = await import("./board.settings");
    setupUserAndOwnership("outsider-1", false, true, false);
    const request = makePatchRequest("board-1", { votingEnabled: "true", votingAllowed: "3", notesLocked: "false", boardLocked: "false" });
    const res = await action({ request, params: { id: "board-1" }, context: {} } as never).catch((e) => e as Response);
    expect((res as Response).status).toBe(403);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });
});
