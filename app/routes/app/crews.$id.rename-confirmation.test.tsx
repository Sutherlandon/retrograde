// @vitest-environment jsdom
// CREW-004: renaming a crew shows a confirmation next to the Rename button.
// The h1 above updates too, but it's far enough up the page — past Roster,
// AI Crew, Boards — that a rename can go unnoticed without one, same
// reasoning as BoardToolbar's post-claim confirmation (BRD-020).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";

const mockFetcher: { data: unknown; state: "idle" | "submitting"; submit: ReturnType<typeof vi.fn> } = {
  data: null,
  state: "idle",
  submit: vi.fn(),
};

vi.mock("react-router", () => ({
  useLoaderData: () => mockLoaderData(),
  useFetcher: () => ({
    ...mockFetcher,
    Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <form {...props}>{children}</form>
    ),
  }),
  redirect: vi.fn(),
}));

const mockLoaderData = vi.fn();

// Same server-module stubbing crews.$id.test.ts uses for the loader/action —
// this file only renders the default component, but the module still pulls
// in the whole graph via its top-level imports.
vi.mock("~/hooks/useAuth", () => ({ requireRegisteredUser: vi.fn() }));
vi.mock("~/server/team_model", () => ({
  getTeamWithMembers: vi.fn(), teamRole: vi.fn(), addTeamMember: vi.fn(),
  removeTeamMember: vi.fn(), renameTeam: vi.fn(), deleteTeamServer: vi.fn(),
  listTeamsForUser: vi.fn(), setTeamBoardRestriction: vi.fn(),
}));
vi.mock("~/server/board_model", () => ({ createBoard: vi.fn(), listVisibleBoards: vi.fn() }));
vi.mock("~/server/board_actions", () => ({ handleBoardMutation: vi.fn() }));
vi.mock("~/server/action_item_model", () => ({
  listOpenActionItemsForTeam: vi.fn(), createTeamActionItem: vi.fn(),
  setTeamActionItemCompleted: vi.fn(), updateTeamActionItemText: vi.fn(), deleteTeamActionItem: vi.fn(),
}));
vi.mock("~/server/api_key", () => ({
  listApiKeysForTeam: vi.fn(), mintApiKey: vi.fn(), revokeApiKey: vi.fn(),
  ApiKeyLimitError: class extends Error {},
}));
vi.mock("~/server/admin_model", () => ({ findRegisteredUserByUsername: vi.fn() }));
vi.mock("~/server/entitlements", () => ({ crewIsEntitled: vi.fn() }));
vi.mock("~/server/db_config", () => ({ pool: { query: vi.fn() } }));
vi.mock("~/server/db_init", () => ({}));

import CrewDetailPage from "./crews.$id";

function baseLoaderData() {
  return {
    team: { id: "team-1", name: "Voyager", is_personal: false, restrict_board_access: true, created_at: "x" },
    members: [],
    boards: [],
    openItems: [],
    teams: [],
    keys: [],
    isTeamOwner: true,
    currentUserId: "user-1",
  };
}

describe("crews.$id rename confirmation (CREW-004)", () => {
  afterEach(() => {
    cleanup();
    mockFetcher.data = null;
  });

  it("shows nothing extra when no rename has happened yet", () => {
    mockLoaderData.mockReturnValue(baseLoaderData());
    render(<CrewDetailPage />);
    expect(screen.queryByText(/Renamed to/)).not.toBeInTheDocument();
  });

  it('shows "Renamed to "<name>"." next to the Rename button after a successful rename', () => {
    mockLoaderData.mockReturnValue(baseLoaderData());
    mockFetcher.data = { success: true, name: "Starfleet Ops" };

    render(<CrewDetailPage />);

    const renameForm = screen.getByRole("button", { name: "Rename" }).closest("form") as HTMLElement;
    expect(within(renameForm).getByText('Renamed to "Starfleet Ops".')).toBeInTheDocument();
  });

  it("does not show the confirmation for an unrelated fetcher error (rename failed)", () => {
    mockLoaderData.mockReturnValue(baseLoaderData());
    mockFetcher.data = { error: "Crew name is required." };

    render(<CrewDetailPage />);

    const renameForm = screen.getByRole("button", { name: "Rename" }).closest("form") as HTMLElement;
    expect(within(renameForm).queryByText(/Renamed to/)).not.toBeInTheDocument();
    expect(within(renameForm).getByText("Crew name is required.")).toBeInTheDocument();
  });
});
