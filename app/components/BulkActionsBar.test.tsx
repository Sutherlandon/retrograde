// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { BulkActionsBar } from "./BulkActionsBar";
import type { TeamSummary } from "~/server/team_model";

const teams: TeamSummary[] = [
  { id: "t1", name: "Personal", is_personal: true, created_at: "x", role: "owner", member_count: 1, board_count: 2, open_action_items: 0 },
  { id: "t2", name: "Design Crew", is_personal: false, created_at: "x", role: "owner", member_count: 3, board_count: 5, open_action_items: 0 },
];

function setup(count = 2) {
  const onMove = vi.fn();
  const onDelete = vi.fn();
  const onClear = vi.fn();
  render(<BulkActionsBar count={count} teams={teams} onMove={onMove} onDelete={onDelete} onClear={onClear} />);
  return { onMove, onDelete, onClear };
}

describe("BulkActionsBar", () => {
  afterEach(() => cleanup());

  it("renders nothing when no boards are selected", () => {
    const { container } = render(
      <BulkActionsBar count={0} teams={teams} onMove={vi.fn()} onDelete={vi.fn()} onClear={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the selection count", () => {
    setup(3);
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();
  });

  it("moves after choosing a team and confirming", () => {
    const { onMove } = setup();
    fireEvent.change(screen.getByLabelText("Move to crew"), { target: { value: "t2" } });
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(screen.getByText(/Move 2 boards to Design Crew\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onMove).toHaveBeenCalledWith("t2");
  });

  it("requires a team choice before moving", () => {
    const { onMove } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });

  it("deletes only after confirmation", () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete 2 boards\?/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("cancel returns to the action state without acting", () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("clear button deselects everything", () => {
    const { onClear } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Clear selection/ }));
    expect(onClear).toHaveBeenCalled();
  });
});
