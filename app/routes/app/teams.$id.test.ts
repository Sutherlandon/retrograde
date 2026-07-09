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
const mockListTeamBoards = vi.fn();
vi.mock("~/server/team_model", () => ({
  getTeamWithMembers: (...args: unknown[]) => mockGetTeamWithMembers(...args),
  teamRole: (...args: unknown[]) => mockTeamRole(...args),
  addTeamMember: (...args: unknown[]) => mockAddTeamMember(...args),
  removeTeamMember: (...args: unknown[]) => mockRemoveTeamMember(...args),
  renameTeam: (...args: unknown[]) => mockRenameTeam(...args),
  deleteTeamServer: (...args: unknown[]) => mockDeleteTeamServer(...args),
  listTeamBoards: (...args: unknown[]) => mockListTeamBoards(...args),
}));

const mockListTeamActionItems = vi.fn();
const mockListTeamBoardActionItems = vi.fn();
const mockCreateTeamActionItem = vi.fn();
const mockSetTeamActionItemCompleted = vi.fn();
const mockDeleteTeamActionItem = vi.fn();
vi.mock("~/server/action_item_model", () => ({
  listTeamActionItems: (...args: unknown[]) => mockListTeamActionItems(...args),
  listTeamBoardActionItems: (...args: unknown[]) => mockListTeamBoardActionItems(...args),
  createTeamActionItem: (...args: unknown[]) => mockCreateTeamActionItem(...args),
  setTeamActionItemCompleted: (...args: unknown[]) => mockSetTeamActionItemCompleted(...args),
  deleteTeamActionItem: (...args: unknown[]) => mockDeleteTeamActionItem(...args),
}));

const mockCreateBoard = vi.fn();
vi.mock("~/server/board_model", () => ({
  createBoard: (...args: unknown[]) => mockCreateBoard(...args),
}));

const mockFindUser = vi.fn();
vi.mock("~/server/admin_model", () => ({
  findRegisteredUserByUsername: (...args: unknown[]) => mockFindUser(...args),
}));

vi.mock("~/components/StatusLED", () => ({ StatusLED: () => null }));
vi.mock("~/images/icons", () => ({
  TrashIcon: () => null,
  PlusIcon: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRegisteredUser.mockResolvedValue({ id: "user-1", username: "landon" });
  mockGetTeamWithMembers.mockResolvedValue({
    team: { id: "team-1", name: "Voyager", is_personal: false, created_at: "x" },
    members: [{ user_id: "user-1", username: "landon", role: "owner", created_at: "x" }],
  });
  mockTeamRole.mockResolvedValue("owner");
  mockListTeamBoards.mockResolvedValue([]);
  mockListTeamActionItems.mockResolvedValue([]);
  mockListTeamBoardActionItems.mockResolvedValue([]);
  mockCreateBoard.mockResolvedValue("board-new");
});

function formRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost:3000/app/teams/team-1", { method: "POST", body: form });
}

describe("teams.$id loader", () => {
  it("returns 403 for non-members", async () => {
    const { loader } = await import("./teams.$id");
    mockTeamRole.mockResolvedValueOnce(null);
    try {
      await loader({ request: new Request("http://x"), params: { id: "team-1" }, context: {} } as never);
      expect.unreachable("should have thrown");
    } catch (response: unknown) {
      expect((response as Response).status).toBe(403);
    }
  });

  it("returns team data with owner flag", async () => {
    const { loader } = await import("./teams.$id");
    const result = await loader({
      request: new Request("http://x"), params: { id: "team-1" }, context: {},
    } as never);
    expect(result.team.name).toBe("Voyager");
    expect(result.isTeamOwner).toBe(true);
  });
});

describe("teams.$id action — owner guards", () => {
  it("rename requires owner", async () => {
    const { action } = await import("./teams.$id");
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

  it("rename + delete are forbidden on personal teams even for the owner", async () => {
    const { action } = await import("./teams.$id");
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

  it("addMember looks up by username and adds", async () => {
    const { action } = await import("./teams.$id");
    mockFindUser.mockResolvedValueOnce({ id: "user-7", username: "sam" });
    const result = await action({
      request: formRequest({ intent: "addMember", username: "sam" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockAddTeamMember).toHaveBeenCalledWith("team-1", "user-7");
    expect((result as { addedUsername?: string }).addedUsername).toBe("sam");
  });

  it("deleteTeam redirects to /app/teams", async () => {
    const { action } = await import("./teams.$id");
    const res = (await action({
      request: formRequest({ intent: "deleteTeam" }),
      params: { id: "team-1" }, context: {},
    } as never)) as Response;
    expect(mockDeleteTeamServer).toHaveBeenCalledWith("team-1");
    expect(res.headers.get("Location")).toBe("/app/teams");
  });
});

describe("teams.$id action — member abilities", () => {
  beforeEach(() => {
    mockTeamRole.mockResolvedValue("member");
  });

  it("members can create a board under the team", async () => {
    const { action } = await import("./teams.$id");
    const res = (await action({
      request: formRequest({ intent: "createBoard", title: "Sprint 13" }),
      params: { id: "team-1" }, context: {},
    } as never)) as Response;
    expect(mockCreateBoard).toHaveBeenCalledWith("Sprint 13", "user-1", "team-1");
    expect(res.headers.get("Location")).toBe("/app/board/board-new");
  });

  it("members can add, toggle, and delete team objectives", async () => {
    const { action } = await import("./teams.$id");

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
      request: formRequest({ intent: "deleteItem", itemId: "i1" }),
      params: { id: "team-1" }, context: {},
    } as never);
    expect(mockDeleteTeamActionItem).toHaveBeenCalledWith("team-1", "i1");
  });
});
