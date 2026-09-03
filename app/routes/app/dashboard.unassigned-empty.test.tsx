// @vitest-environment jsdom
// DASH-013: the "?team=unassigned" filter, empty case. When a user opens
// this view and every board they can see already belongs to a crew, the
// boards toolbar and table are replaced with a message and a way back —
// otherwise the view renders as an unlabeled empty table with no
// indication the URL-only filter is even active.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { DashboardBoardRow } from "~/server/board.types";
import type { TeamSummary } from "~/server/team_model";

const mockLoaderData = vi.fn();
const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("react-router", () => ({
  useLoaderData: () => mockLoaderData(),
  useSearchParams: () => [mockSearchParams(), vi.fn()],
  useFetcher: () => ({ submit: vi.fn(), load: vi.fn(), data: null, state: "idle" as const }),
  useNavigate: () => vi.fn(),
  Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
    <form {...props}>{children}</form>
  ),
  Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string }>) => (
    <a href={to} {...props}>{children}</a>
  ),
  redirect: vi.fn(),
  createCookieSessionStorage: () => ({
    getSession: vi.fn(),
    commitSession: vi.fn(),
    destroySession: vi.fn(),
  }),
}));

// Same server-module stubbing dashboard.filter.test.tsx uses — dashboard.tsx
// pulls in the full server graph via its loader/action exports.
vi.mock("~/session.server", () => ({
  getSession: vi.fn(async () => ({ get: () => undefined, set: vi.fn(), unset: vi.fn() })),
  commitSession: vi.fn(async () => "session-cookie-value"),
}));
vi.mock("~/server/db_config", () => ({ pool: { query: vi.fn() } }));
vi.mock("~/config/siteConfig", () => ({ siteConfig: { usernameField: "preferred_username" } }));
vi.mock("~/server/board_model", () => ({
  createBoard: vi.fn(),
  listVisibleBoards: vi.fn(),
  duplicateBoardServer: vi.fn(),
  deleteBoardServer: vi.fn(),
  archiveBoardServer: vi.fn(),
  unarchiveBoardServer: vi.fn(),
  moveBoardsToTeamServer: vi.fn(),
  bulkDeleteBoardsServer: vi.fn(),
}));
vi.mock("~/server/team_model", () => ({
  getPersonalTeamForUser: vi.fn(),
  listTeamsForUser: vi.fn(),
  userIsTeamMember: vi.fn(),
}));
vi.mock("~/server/action_item_model", () => ({
  listOpenActionItemsForUser: vi.fn(),
}));
vi.mock("~/server/db_init", () => ({}));

import AppDashboard from "./dashboard";

function board(id: string, title: string, teamId: string | null): DashboardBoardRow {
  return {
    id,
    title,
    team_id: teamId,
    team_name: teamId ? "Some Crew" : null,
    role: "owner",
    open_action_items: 0,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  };
}

describe("dashboard unassigned view, empty (DASH-013)", () => {
  afterEach(() => cleanup());

  it("shows a message and a link back to /dashboard instead of the table when there are no unassigned boards", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("team=unassigned"));
    mockLoaderData.mockReturnValue({
      boards: [board("b1", "Crewed Board", "t1")],
      archivedBoards: [],
      teams: [] as TeamSummary[],
      openItems: [],
      sort: "updated",
    });

    render(<AppDashboard />);

    expect(screen.getByText("No unassigned boards")).toBeInTheDocument();
    const back = screen.getByRole("link", { name: /back to dashboard/i });
    expect(back).toHaveAttribute("href", "/app/dashboard");

    // The table and its toolbar are gone, not just empty.
    expect(screen.queryByPlaceholderText("Filter boards…")).not.toBeInTheDocument();
    expect(screen.queryByText("Crewed Board")).not.toBeInTheDocument();
  });

  it("still renders the boards table when the unassigned view has boards", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("team=unassigned"));
    mockLoaderData.mockReturnValue({
      boards: [board("b1", "Loose Board", null)],
      archivedBoards: [],
      teams: [] as TeamSummary[],
      openItems: [],
      sort: "updated",
    });

    render(<AppDashboard />);

    expect(screen.queryByText("No unassigned boards")).not.toBeInTheDocument();
    expect(screen.getByText("Loose Board")).toBeInTheDocument();
  });

  it("does not show the unassigned-empty message on the plain dashboard view", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams());
    mockLoaderData.mockReturnValue({
      boards: [board("b1", "Crewed Board", "t1")],
      archivedBoards: [],
      teams: [] as TeamSummary[],
      openItems: [],
      sort: "updated",
    });

    render(<AppDashboard />);

    expect(screen.queryByText("No unassigned boards")).not.toBeInTheDocument();
    expect(screen.getByText("Crewed Board")).toBeInTheDocument();
  });
});
