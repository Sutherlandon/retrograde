// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("react-router", () => ({
  useFetcher: () => ({ submit: vi.fn(), data: null, state: "idle" }),
  useNavigate: () => vi.fn(),
}));

import { DashboardBoardsTable, type DashboardBoardRow } from "./DashboardBoardsTable";
import type { TeamSummary } from "~/server/team_model";

const teams: TeamSummary[] = [
  { id: "t1", name: "Design Crew", is_personal: false, created_at: "x", role: "owner", member_count: 2, board_count: 1, open_action_items: 0 },
];

const boards: DashboardBoardRow[] = [
  {
    id: "b1", title: "Owned Board", team_id: "t1", team_name: "Design Crew", role: "owner", can_manage: true,
    open_action_items: 2, created_at: "2026-07-01", updated_at: "2026-07-10",
  },
  {
    id: "b2", title: "Team Board", team_id: "t1", team_name: "Design Crew", role: "team", can_manage: false,
    open_action_items: 0, created_at: "2026-07-02", updated_at: "2026-07-11",
  },
  {
    id: "b3", title: "Drifting Board", team_id: null, team_name: null, role: "owner", can_manage: true,
    open_action_items: 0, created_at: "2026-07-03", updated_at: "2026-07-12",
  },
  {
    // ADR-0027: someone else owns it; the viewer owns the crew.
    id: "b5", title: "Crew Board", team_id: "t1", team_name: "Design Crew", role: "team", can_manage: true,
    open_action_items: 0, created_at: "2026-07-04", updated_at: "2026-07-13",
  },
];

function setup(selected: string[] = []) {
  const onToggle = vi.fn();
  const onSelectAll = vi.fn();
  render(
    <DashboardBoardsTable
      boards={boards}
      teams={teams}
      selected={new Set(selected)}
      onToggle={onToggle}
      onSelectAll={onSelectAll}
    />
  );
  return { onToggle, onSelectAll };
}

describe("DashboardBoardsTable", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renders a row per board with an amber Unassigned chip for teamless boards", () => {
    setup();
    expect(screen.getByText("Owned Board")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("only boards the viewer may manage get an enabled selection checkbox", () => {
    setup();
    expect(screen.getByRole("checkbox", { name: "Select Owned Board" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Select Team Board" })).toBeDisabled();
  });

  it("a board the viewer may manage but does not own is selectable and has the full menu (ADR-0027)", () => {
    setup();
    expect(screen.getByRole("checkbox", { name: "Select Crew Board" })).toBeEnabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Board actions" })[3]);
    expect(screen.getByText("Delete Board")).toBeInTheDocument();
    expect(screen.getByText("Move to Crew")).toBeInTheDocument();
  });

  it("a crew board the viewer may not manage has no Delete in its menu", () => {
    setup();
    fireEvent.click(screen.getAllByRole("button", { name: "Board actions" })[1]);
    expect(screen.queryByText("Delete Board")).toBeNull();
  });

  it("toggling a row checkbox reports the board id", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Owned Board" }));
    expect(onToggle).toHaveBeenCalledWith("b1");
  });

  it("select-all reports every board id the viewer may manage", () => {
    const { onSelectAll } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all boards" }));
    expect(onSelectAll).toHaveBeenCalledWith(["b1", "b3", "b5"]);
  });

  it("select-all clears when everything manageable is already selected", () => {
    const { onSelectAll } = setup(["b1", "b3", "b5"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all boards" }));
    expect(onSelectAll).toHaveBeenCalledWith([]);
  });

  it("hides the Crew column and cells when showCrewColumn is false", () => {
    render(
      <DashboardBoardsTable
        boards={boards}
        teams={teams}
        selected={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        showCrewColumn={false}
      />
    );
    expect(screen.queryByRole("columnheader", { name: "Crew" })).toBeNull();
    // No crew/unassigned cell rendered
    expect(screen.queryByText("Unassigned")).toBeNull();
    // Other columns still present
    expect(screen.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("Owned Board")).toBeInTheDocument();
  });
});

describe("DashboardBoardsTable — archived mode", () => {
  afterEach(() => cleanup());

  const archivedBoards = [
    {
      id: "b4", title: "Old Retro", team_id: "t1", team_name: "Design Crew", role: "owner", can_manage: true,
      open_action_items: 0, created_at: "2026-06-01", updated_at: "2026-06-15", archived_at: "2026-07-20",
    },
  ];

  it("shows an Archived column instead of Updated, using archived_at", () => {
    render(<DashboardBoardsTable boards={archivedBoards} teams={teams} archived />);
    expect(screen.getByRole("columnheader", { name: "Archived" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Updated" })).toBeNull();
    expect(screen.getByText(new Date("2026-07-20").toLocaleDateString())).toBeInTheDocument();
  });

  it("renders no selection checkboxes or select-all column", () => {
    render(<DashboardBoardsTable boards={archivedBoards} teams={teams} archived />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
