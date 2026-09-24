// @vitest-environment jsdom
// ADR-0015: when a named crew's owner lapses, the page itself should make
// that obvious and unworkable — a banner with a resubscribe CTA, and every
// frozen control (rename, roster, AI crew, boards, settings, danger zone)
// visibly disabled. Checking off an existing action item is the one
// exception (CREW-015) and isn't covered here — see DashboardActionItems.test.tsx.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

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
  Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <form {...props}>{children}</form>
  ),
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

function loaderData(overrides: Record<string, unknown> = {}) {
  return {
    team: { id: "team-1", name: "Voyager", is_personal: false, restrict_board_access: true, created_at: "x" },
    members: [{ user_id: "user-1", username: "landon", role: "owner", created_at: "x" }],
    boards: [],
    openItems: [],
    teams: [],
    keys: [{ id: "key-1", display_name: "Claude", key_prefix: "rk_test_abc", revoked_at: null, last_used_at: null }],
    isTeamOwner: true,
    currentUserId: "user-1",
    isEntitled: true,
    ...overrides,
  };
}

describe("crews.$id — lapsed-crew read-only UI (ADR-0015)", () => {
  afterEach(() => cleanup());

  it("shows no banner and leaves controls enabled when the crew is entitled", () => {
    mockLoaderData.mockReturnValue(loaderData({ isEntitled: true }));
    render(<CrewDetailPage />);
    expect(screen.queryByTestId("lapsed-banner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /New Board/ })).toBeEnabled();
  });

  it("shows a read-only banner with a resubscribe CTA when the crew's owner has lapsed", () => {
    mockLoaderData.mockReturnValue(loaderData({ isEntitled: false }));
    render(<CrewDetailPage />);
    const banner = screen.getByTestId("lapsed-banner");
    expect(banner).toHaveTextContent(/read-only/i);
    expect(banner).toHaveTextContent(/subscription has lapsed/i);
    const subscribeForm = screen.getByRole("button", { name: /Subscribe/ }).closest("form");
    expect(subscribeForm).toHaveAttribute("action", "/app/billing/checkout");
  });

  it("never shows the banner for a personal crew, even defensively", () => {
    mockLoaderData.mockReturnValue(loaderData({
      team: { id: "team-1", name: "Landon", is_personal: true, restrict_board_access: false, created_at: "x" },
      isEntitled: false,
    }));
    render(<CrewDetailPage />);
    expect(screen.queryByTestId("lapsed-banner")).not.toBeInTheDocument();
  });

  it("disables rename, add-member, mint-key, create-board, and the danger-zone inputs and buttons when lapsed", () => {
    mockLoaderData.mockReturnValue(loaderData({ isEntitled: false }));
    render(<CrewDetailPage />);

    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(screen.getByPlaceholderText("New board title")).toBeDisabled();
    expect(screen.getByRole("button", { name: /New Board/ })).toBeDisabled();
    expect(screen.getByPlaceholderText("Add member by username")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to Crew" })).toBeDisabled();
    expect(screen.getByPlaceholderText(/Agent name/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add AI Crewmate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeDisabled();
    expect(screen.getByLabelText(/Type/)).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("hides the add-action-item row when lapsed (existing items can still be checked off elsewhere)", () => {
    mockLoaderData.mockReturnValue(loaderData({ isEntitled: false }));
    render(<CrewDetailPage />);
    expect(screen.queryByTestId("add-action-item-input")).not.toBeInTheDocument();
  });
});
