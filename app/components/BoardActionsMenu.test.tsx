// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mockSubmit = vi.fn();
vi.mock("react-router", () => ({
  useFetcher: () => ({ submit: mockSubmit, data: null, state: "idle" }),
}));

import { BoardActionsMenu } from "./BoardActionsMenu";
import type { TeamSummary } from "~/server/team_model";

const teams: TeamSummary[] = [
  { id: "t1", name: "Personal", is_personal: true, created_at: "x", role: "owner", member_count: 1, board_count: 2, open_action_items: 0 },
  { id: "t2", name: "Design Crew", is_personal: false, created_at: "x", role: "owner", member_count: 3, board_count: 5, open_action_items: 0 },
];

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Board actions" }));
}

describe("BoardActionsMenu — move to team", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("shows Move to Crew for owners when crews are provided", () => {
    render(<BoardActionsMenu boardId="b1" boardTitle="Retro" isOwner isArchived={false} teams={teams} currentTeamId="t1" />);
    openMenu();
    expect(screen.getByText("Move to Crew")).toBeInTheDocument();
  });

  it("hides Move to Crew for non-owners", () => {
    render(<BoardActionsMenu boardId="b1" boardTitle="Retro" isOwner={false} isArchived={false} teams={teams} currentTeamId="t1" />);
    openMenu();
    expect(screen.queryByText("Move to Crew")).toBeNull();
  });

  it("lists destination teams excluding the board's current team", () => {
    render(<BoardActionsMenu boardId="b1" boardTitle="Retro" isOwner isArchived={false} teams={teams} currentTeamId="t1" />);
    openMenu();
    fireEvent.click(screen.getByText("Move to Crew"));
    expect(screen.getByText("Design Crew")).toBeInTheDocument();
    expect(screen.queryByText("Personal")).toBeNull();
  });

  it("submits a moveBoard intent when a destination team is picked", () => {
    render(<BoardActionsMenu boardId="b1" boardTitle="Retro" isOwner isArchived={false} teams={teams} currentTeamId="t1" />);
    openMenu();
    fireEvent.click(screen.getByText("Move to Crew"));
    fireEvent.click(screen.getByText("Design Crew"));
    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "moveBoard", boardId: "b1", teamId: "t2" },
      { method: "post" }
    );
  });

  it("offers Remove from crew only when the board is on a crew, submitting 'none'", () => {
    render(<BoardActionsMenu boardId="b1" boardTitle="Retro" isOwner isArchived={false} teams={teams} currentTeamId="t2" />);
    openMenu();
    fireEvent.click(screen.getByText("Move to Crew"));
    fireEvent.click(screen.getByText("Remove from crew"));
    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "moveBoard", boardId: "b1", teamId: "none" },
      { method: "post" }
    );
  });

  it("does not offer Remove from crew for an unassigned board", () => {
    render(<BoardActionsMenu boardId="b1" boardTitle="Retro" isOwner isArchived={false} teams={teams} currentTeamId={null} />);
    openMenu();
    fireEvent.click(screen.getByText("Move to Crew"));
    expect(screen.queryByText("Remove from crew")).toBeNull();
  });

  it("still renders the classic actions without team props (board page usage)", () => {
    render(<BoardActionsMenu boardId="b1" boardTitle="Retro" isOwner isArchived={false} />);
    openMenu();
    expect(screen.getByText("Duplicate Board")).toBeInTheDocument();
    expect(screen.queryByText("Move to Crew")).toBeNull();
  });
});
