import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireRegisteredUser = vi.fn();
vi.mock("~/hooks/useAuth", () => ({
  requireRegisteredUser: (...args: unknown[]) => mockRequireRegisteredUser(...args),
}));

const mockGetTeamWithMembers = vi.fn();
const mockTeamRole = vi.fn();
const mockAddTeamMember = vi.fn();
const mockRemoveTeamMember = vi.fn();
const mockRenameTeam = vi.fn();
const mockDeleteTeamServer = vi.fn();
const mockListTeamsForUser = vi.fn();
const mockSetTeamBoardRestriction = vi.fn();
vi.mock("~/server/team_model", () => ({
  getTeamWithMembers: (...args: unknown[]) => mockGetTeamWithMembers(...args),
  teamRole: (...args: unknown[]) => mockTeamRole(...args),
  addTeamMember: (...args: unknown[]) => mockAddTeamMember(...args),
  removeTeamMember: (...args: unknown[]) => mockRemoveTeamMember(...args),
  renameTeam: (...args: unknown[]) => mockRenameTeam(...args),
  deleteTeamServer: (...args: unknown[]) => mockDeleteTeamServer(...args),
  listTeamsForUser: (...args: unknown[]) => mockListTeamsForUser(...args),
  setTeamBoardRestriction: (...args: unknown[]) => mockSetTeamBoardRestriction(...args),
}));

const mockListOpenActionItemsForTeam = vi.fn();
const mockCreateTeamActionItem = vi.fn();
const mockSetTeamActionItemCompleted = vi.fn();
const mockUpdateTeamActionItemText = vi.fn();
const mockDeleteTeamActionItem = vi.fn();
vi.mock("~/server/action_item_model", () => ({
  listOpenActionItemsForTeam: (...args: unknown[]) => mockListOpenActionItemsForTeam(...args),
  createTeamActionItem: (...args: unknown[]) => mockCreateTeamActionItem(...args),
  setTeamActionItemCompleted: (...args: unknown[]) => mockSetTeamActionItemCompleted(...args),
  updateTeamActionItemText: (...args: unknown[]) => mockUpdateTeamActionItemText(...args),
  deleteTeamActionItem: (...args: unknown[]) => mockDeleteTeamActionItem(...args),
}));

const mockCreateBoard = vi.fn();
const mockListVisibleBoards = vi.fn();
vi.mock("~/server/board_model", () => ({
  createBoard: (...args: unknown[]) => mockCreateBoard(...args),
  listVisibleBoards: (...args: unknown[]) => mockListVisibleBoards(...args),
}));

const mockHandleBoardMutation = vi.fn();
vi.mock("~/server/board_actions", () => ({
  handleBoardMutation: (...args: unknown[]) => mockHandleBoardMutation(...args),
}));

const mockListApiKeysForTeam = vi.fn();
const mockMintApiKey = vi.fn();
const mockRevokeApiKey = vi.fn();
class MockApiKeyLimitError extends Error {}
vi.mock("~/server/api_key", () => ({
  listApiKeysForTeam: (...args: unknown[]) => mockListApiKeysForTeam(...args),
  mintApiKey: (...args: unknown[]) => mockMintApiKey(...args),
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
  ApiKeyLimitError: MockApiKeyLimitError,
}));

const mockFindUser = vi.fn();
vi.mock("~/server/admin_model", () => ({
  findRegisteredUserByUsername: (...args: unknown[]) => mockFindUser(...args),
}));

const mockCrewIsEntitled = vi.fn();
vi.mock("~/server/entitlements", () => ({
  crewIsEntitled: (...args: unknown[]) => mockCrewIsEntitled(...args),
}));

// The page module imports the refined components at the top level, but they
// never render in these loader/action tests. Real icons/StatusLED load fine in
// node (they're plain components, never invoked here).
vi.mock("~/components/StatusLED", () => ({ StatusLED: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRegisteredUser.mockResolvedValue({ id: "user-1", username: "landon" });
  mockGetTeamWithMembers.mockResolvedValue({
    team: { id: "team-1", name: "Voyager", is_personal: false, created_at: "x" },
    members: [{ user_id: "user-1", username: "landon", role: "owner", created_at: "x" }],
  });
  mockTeamRole.mockResolvedValue("owner");
  mockListVisibleBoards.mockResolvedValue([]);
  mockListOpenActionItemsForTeam.mockResolvedValue([]);
  mockListTeamsForUser.mockResolvedValue([]);
  mockHandleBoardMutation.mockResolvedValue({ handled: false });
  mockCreateBoard.mockResolvedValue("board-new");
  mockListApiKeysForTeam.mockResolvedValue([]);
  mockMintApiKey.mockResolvedValue({ key: "rk_live_secret", apiKey: { display_name: "Claude" } });
  mockCrewIsEntitled.mockResolvedValue(true);
});

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/crews/team-1", { method: "POST", body: form });
}

describe("teams.$id loader", () => {
  it("returns 403 for non-members (CREW-003)", async () => {
    const { loader } = await import("./crews.$id");
    mockTeamRole.mockResolvedValueOnce(null);
    try {
      await loader({ request: new Request("http://x"), params: { id: "team-1" }, context: {} } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
  });

  it("returns team data with owner flag, crew-scoped boards, open items, and crews (CREW-003, CREW-010, CREW-013, CREW-018)", async () => {
    const { loader } = await import("./crews.$id");
    mockListVisibleBoards.mockResolvedValueOnce([{ id: "b1", title: "Retro", role: "owner" }]);
    mockListOpenActionItemsForTeam.mockResolvedValueOnce([{ id: "ai1", text: "Do it" }]);
    mockListTeamsForUser.mockResolvedValueOnce([{ id: "team-1", name: "Voyager" }]);
    mockListApiKeysForTeam.mockResolvedValueOnce([{ id: "key-1", display_name: "Claude" }]);

    const result = await loader({
      request: new Request("http://x"), params: { id: "team-1" }, context: {},
    } as never);

    expect(result.team.name).toBe("Voyager");
    expect(result.isTeamOwner).toBe(true);
    expect(result.boards).toHaveLength(1);
    expect(result.openItems).toHaveLength(1);
    expect(result.teams).toHaveLength(1);
    expect(result.keys).toHaveLength(1);
    expect(result.isEntitled).toBe(true);
    // Boards are scoped to this crew; open items and AI keys to this crew.
    expect(mockListVisibleBoards).toHaveBeenCalledWith("user-1", { teamId: "team-1" });
    expect(mockListOpenActionItemsForTeam).toHaveBeenCalledWith("team-1", "user-1");
    expect(mockListApiKeysForTeam).toHaveBeenCalledWith("team-1");
    expect(mockCrewIsEntitled).toHaveBeenCalledWith("team-1");
  });

  it("surfaces isEntitled: false when the crew's owner has lapsed (ADR-0015), so the page can freeze itself", async () => {
    const { loader } = await import("./crews.$id");
    mockCrewIsEntitled.mockResolvedValueOnce(false);

    const result = await loader({
      request: new Request("http://x"), params: { id: "team-1" }, context: {},
    } as never);

    expect(result.isEntitled).toBe(false);
  });
});

describe("crews.$id action — AI crewmates (API keys)", () => {
  it("mints a key for the crew owner (CREW-009)", async () => {
    const { action } = await import("./crews.$id");
    const result = await action({
      request: formRequest({ intent: "mintKey", display_name: "Claude (roadmap)" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockMintApiKey).toHaveBeenCalledWith("team-1", "Claude (roadmap)", "user-1");
    expect((result as { mintedKey?: string }).mintedKey).toBe("rk_live_secret");
  });

  it("forbids non-owners from minting (CREW-009)", async () => {
    const { action } = await import("./crews.$id");
    mockTeamRole.mockResolvedValueOnce("member");
    try {
      await action({
        request: formRequest({ intent: "mintKey", display_name: "X" }),
        params: { id: "team-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockMintApiKey).not.toHaveBeenCalled();
  });

  it("allows minting on a personal crew (unlike human addMember)", async () => {
    const { action } = await import("./crews.$id");
    mockGetTeamWithMembers.mockResolvedValue({
      team: { id: "team-1", name: "landon's Team", is_personal: true, created_at: "x" },
      members: [],
    });
    const result = await action({
      request: formRequest({ intent: "mintKey", display_name: "Solo Agent" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockMintApiKey).toHaveBeenCalledWith("team-1", "Solo Agent", "user-1");
    expect((result as { mintedKey?: string }).mintedKey).toBe("rk_live_secret");
  });

  it("CREW-019: surfaces the personal-crew key limit as a form error, not a 500", async () => {
    const { action } = await import("./crews.$id");
    mockGetTeamWithMembers.mockResolvedValue({
      team: { id: "team-1", name: "landon's Team", is_personal: true, created_at: "x" },
      members: [],
    });
    mockMintApiKey.mockRejectedValueOnce(
      new MockApiKeyLimitError("Personal crews can hold one AI crewmate. Create a named crew to add more.")
    );
    const result = await action({
      request: formRequest({ intent: "mintKey", display_name: "Second Agent" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect((result as { error?: string }).error).toBe(
      "Personal crews can hold one AI crewmate. Create a named crew to add more."
    );
  });

  it("revokes a key scoped to the crew (CREW-011)", async () => {
    const { action } = await import("./crews.$id");
    const result = await action({
      request: formRequest({ intent: "revokeKey", api_key_id: "key-1" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockRevokeApiKey).toHaveBeenCalledWith("key-1", "team-1");
    expect((result as { revokedId?: string }).revokedId).toBe("key-1");
  });
});

describe("crews.$id action — shared board mutations", () => {
  it("delegates board intents to handleBoardMutation and returns its result", async () => {
    const { action } = await import("./crews.$id");
    mockHandleBoardMutation.mockResolvedValueOnce({ handled: true, result: { moved: 2 } });

    const result = await action({
      request: formRequest({ intent: "bulkMove", boardIds: "b1,b2", teamId: "team-9" }),
      params: { id: "team-1" }, context: {},
    } as never);

    expect(mockHandleBoardMutation).toHaveBeenCalled();
    expect(result).toEqual({ moved: 2 });
    // Short-circuits before crew-membership work.
    expect(mockGetTeamWithMembers).not.toHaveBeenCalled();
  });
});

describe("crews.$id action — members-only board access", () => {
  it("owner can toggle the crew's board restriction (CREW-008)", async () => {
    const { action } = await import("./crews.$id");
    const result = await action({
      request: formRequest({ intent: "setRestrictAccess", restrict: "false" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockSetTeamBoardRestriction).toHaveBeenCalledWith("team-1", false);
    expect((result as { success?: boolean }).success).toBe(true);
  });

  it("non-owners cannot change board restriction (CREW-008)", async () => {
    const { action } = await import("./crews.$id");
    mockTeamRole.mockResolvedValueOnce("member");
    try {
      await action({
        request: formRequest({ intent: "setRestrictAccess", restrict: "true" }),
        params: { id: "team-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockSetTeamBoardRestriction).not.toHaveBeenCalled();
  });
});

describe("teams.$id action — owner guards", () => {
  it("rename requires owner (CREW-004)", async () => {
    const { action } = await import("./crews.$id");
    mockTeamRole.mockResolvedValueOnce("member");
    try {
      await action({
        request: formRequest({ intent: "rename", name: "X" }),
        params: { id: "team-1" }, context: {},
      } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
    expect(mockRenameTeam).not.toHaveBeenCalled();
  });

  it("rename + delete are forbidden on personal teams even for the owner (CREW-004, CREW-005)", async () => {
    const { action } = await import("./crews.$id");
    mockGetTeamWithMembers.mockResolvedValue({
      team: { id: "team-1", name: "landon's Team", is_personal: true, created_at: "x" },
      members: [],
    });
    for (const intent of ["rename", "deleteTeam"]) {
      try {
        await action({
          request: formRequest({ intent, name: "X" }),
          params: { id: "team-1" }, context: {},
        } as never);
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        expect((response as Response).status).toBe(403);
      }
    }
  });

  it("rename echoes the new name back for the confirmation banner (CREW-004)", async () => {
    const { action } = await import("./crews.$id");
    mockTeamRole.mockResolvedValueOnce("owner");
    mockRenameTeam.mockResolvedValueOnce(undefined);
    const result = await action({
      request: formRequest({ intent: "rename", name: "Starfleet Ops" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockRenameTeam).toHaveBeenCalledWith("team-1", "Starfleet Ops");
    expect(result).toEqual({ success: true, name: "Starfleet Ops" });
  });

  it("addMember looks up by username and adds (CREW-006)", async () => {
    const { action } = await import("./crews.$id");
    mockFindUser.mockResolvedValueOnce({ id: "user-7", username: "sam" });
    const result = await action({
      request: formRequest({ intent: "addMember", username: "sam" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockAddTeamMember).toHaveBeenCalledWith("team-1", "user-7");
    expect((result as { addedUsername?: string }).addedUsername).toBe("sam");
  });

  it("deleteTeam redirects to /app/crews (CREW-005)", async () => {
    const { action } = await import("./crews.$id");
    const res = (await action({
      request: formRequest({ intent: "deleteTeam" }),
      params: { id: "team-1" }, context: {},
    } as never)) as Response;
    expect(mockDeleteTeamServer).toHaveBeenCalledWith("team-1");
    expect(res.headers.get("Location")).toBe("/app/crews");
  });
});

describe("teams.$id action — member abilities", () => {
  beforeEach(() => {
    mockTeamRole.mockResolvedValue("member");
  });

  it("members can create a board under the team (CREW-012)", async () => {
    const { action } = await import("./crews.$id");
    const res = (await action({
      request: formRequest({ intent: "createBoard", title: "Sprint 13" }),
      params: { id: "team-1" }, context: {},
    } as never)) as Response;
    expect(mockCreateBoard).toHaveBeenCalledWith("Sprint 13", "user-1", "team-1");
    expect(res.headers.get("Location")).toBe("/app/board/board-new");
  });

  it("members can add, toggle, and delete team objectives (CREW-014, CREW-015, CREW-016, CREW-017)", async () => {
    const { action } = await import("./crews.$id");

    await action({
      request: formRequest({ intent: "addItem", text: "Do the thing" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockCreateTeamActionItem).toHaveBeenCalledWith("team-1", "Do the thing", "user-1");

    await action({
      request: formRequest({ intent: "toggleItem", itemId: "i1", completed: "true" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockSetTeamActionItemCompleted).toHaveBeenCalledWith("team-1", "i1", true);

    await action({
      request: formRequest({ intent: "updateItem", itemId: "i1", text: "Sharper wording" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockUpdateTeamActionItemText).toHaveBeenCalledWith("team-1", "i1", "Sharper wording");

    await action({
      request: formRequest({ intent: "deleteItem", itemId: "i1" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockDeleteTeamActionItem).toHaveBeenCalledWith("team-1", "i1");
  });
});

// GAP-005/ADR-0013: when the crew's owner lapses (crewIsEntitled returns
// false), every intent that creates or manages crew work freezes with 402 —
// except toggleItem, which only checks off work that already exists.
describe("crews.$id action — crew entitlement gate (owner lapse freezes management)", () => {
  const FROZEN_CASES: Array<{
    intent: string; fields: Record<string, string>; modelMock: ReturnType<typeof vi.fn>; label: string;
    setup?: () => void;
  }> = [
    { intent: "rename", fields: { name: "New Name" }, modelMock: mockRenameTeam, label: "CREW-004" },
    { intent: "deleteTeam", fields: {}, modelMock: mockDeleteTeamServer, label: "CREW-005" },
    { intent: "setRestrictAccess", fields: { restrict: "true" }, modelMock: mockSetTeamBoardRestriction, label: "CREW-008" },
    {
      intent: "addMember", fields: { username: "sam" }, modelMock: mockAddTeamMember, label: "CREW-006",
      setup: () => mockFindUser.mockResolvedValueOnce({ id: "user-7", username: "sam" }),
    },
    { intent: "removeMember", fields: { userId: "user-7" }, modelMock: mockRemoveTeamMember, label: "CREW-007" },
    { intent: "mintKey", fields: { display_name: "Agent" }, modelMock: mockMintApiKey, label: "CREW-009" },
    { intent: "revokeKey", fields: { api_key_id: "key-1" }, modelMock: mockRevokeApiKey, label: "CREW-011" },
    { intent: "createBoard", fields: { title: "New Board" }, modelMock: mockCreateBoard, label: "CREW-012" },
    { intent: "addItem", fields: { text: "Do it" }, modelMock: mockCreateTeamActionItem, label: "CREW-014" },
    { intent: "updateItem", fields: { itemId: "i1", text: "Updated" }, modelMock: mockUpdateTeamActionItemText, label: "CREW-016" },
    { intent: "deleteItem", fields: { itemId: "i1" }, modelMock: mockDeleteTeamActionItem, label: "CREW-017" },
  ];

  for (const { intent, fields, modelMock, label, setup } of FROZEN_CASES) {
    it(`${label}: ${intent} returns 402 and never calls the model when the crew is not entitled`, async () => {
      mockCrewIsEntitled.mockResolvedValueOnce(false);
      const { action } = await import("./crews.$id");
      try {
        await action({
          request: formRequest({ intent, ...fields }),
          params: { id: "team-1" }, context: {},
        } as never);
        expect.unreachable("should have thrown");
      } catch (response: unknown) {
        expect((response as Response).status).toBe(402);
      }
      expect(mockCrewIsEntitled).toHaveBeenCalledWith("team-1");
      expect(modelMock).not.toHaveBeenCalled();
    });

    it(`${label}: ${intent} proceeds as before when the crew is entitled`, async () => {
      mockCrewIsEntitled.mockResolvedValueOnce(true);
      setup?.();
      const { action } = await import("./crews.$id");
      await action({
        request: formRequest({ intent, ...fields }),
        params: { id: "team-1" }, context: {},
      } as never);
      expect(modelMock).toHaveBeenCalled();
    });
  }

  it("CREW-015: toggleItem is not frozen — it succeeds even when the crew is not entitled", async () => {
    // Not `.mockResolvedValueOnce`: toggleItem never calls crewIsEntitled at
    // all (that's the point of this test), so a queued "once" value here
    // would go unconsumed and leak into the next test's first call.
    mockCrewIsEntitled.mockResolvedValue(false);
    const { action } = await import("./crews.$id");
    const result = await action({
      request: formRequest({ intent: "toggleItem", itemId: "i1", completed: "true" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockSetTeamActionItemCompleted).toHaveBeenCalledWith("team-1", "i1", true);
    expect((result as { success?: boolean }).success).toBe(true);
  });

  it("a personal crew is unaffected by the entitlement gate (crewIsEntitled always true for it)", async () => {
    mockGetTeamWithMembers.mockResolvedValue({
      team: { id: "team-1", name: "landon's Team", is_personal: true, created_at: "x" },
      members: [],
    });
    mockCrewIsEntitled.mockResolvedValueOnce(true);
    const { action } = await import("./crews.$id");
    const result = await action({
      request: formRequest({ intent: "createBoard", title: "Sprint 13" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockCreateBoard).toHaveBeenCalledWith("Sprint 13", "user-1", "team-1");
    expect((result as Response).headers?.get("Location")).toBe("/app/board/board-new");
  });
});
