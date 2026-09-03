// @vitest-environment jsdom
// DASH-004: filtering the dashboard boards table by fuzzy text. The pure
// matcher itself is unit-tested in dashboard.test.ts; this file confirms the
// visible "Filter boards…" input actually drives the rendered table.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { DashboardBoardRow } from "~/server/board.types";
import type { TeamSummary } from "~/server/team_model";

const mockLoaderData = vi.fn();
const mockSetSearchParams = vi.fn();

vi.mock("react-router", () => ({
  useLoaderData: () => mockLoaderData(),
  useSearchParams: () => [new URLSearchParams(), mockSetSearchParams],
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

// dashboard.tsx pulls in the full server module graph via its loader/action
// exports even though this file only renders the default component — stub
// out the same server-only dependencies the loader/action tests in
// dashboard.test.ts already mock, so importing the module here is side-effect free.
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

function board(id: string, title: string): DashboardBoardRow {
  return {
    id,
    title,
    team_id: null,
    team_name: null,
    role: "owner",
    open_action_items: 0,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
  };
}

describe("dashboard filter input (DASH-004)", () => {
  afterEach(() => cleanup());

  it("typing a fuzzy query filters the boards table to matching titles", () => {
    mockLoaderData.mockReturnValue({
      boards: [board("b1", "Retrograde Planning"), board("b2", "Sprint Review")],
      archivedBoards: [],
      teams: [] as TeamSummary[],
      openItems: [],
      sort: "updated",
    });

    render(<AppDashboard />);

    expect(screen.getByText("Retrograde Planning")).toBeInTheDocument();
    expect(screen.getByText("Sprint Review")).toBeInTheDocument();

    const filterInput = screen.getByPlaceholderText("Filter boards…");
    fireEvent.change(filterInput, { target: { value: "rtg" } });

    // "rtg" is a subsequence of "Retrograde" but not of "Sprint Review".
    expect(screen.getByText("Retrograde Planning")).toBeInTheDocument();
    expect(screen.queryByText("Sprint Review")).not.toBeInTheDocument();
  });
});
