// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const mockSubmit = vi.fn();
vi.mock("react-router", () => ({
  useFetcher: () => ({ submit: mockSubmit, data: null, state: "idle", formData: undefined }),
}));

import { DashboardActionItems } from "./DashboardActionItems";
import type { UserActionItemRow } from "~/server/action_item_model";

const boardItem: UserActionItemRow = {
  id: "a1", text: "Fix the deploy pipeline", created_at: "x",
  team_id: null, team_name: null,
  board_id: "b1", board_title: "Sprint 12", board_team_id: "t1", board_team_name: "Design Crew",
  can_manage: true,
};

const unassignedBoardItem: UserActionItemRow = {
  ...boardItem, id: "a4", text: "Rename the repo", board_team_id: null, board_team_name: null,
};

const teamItem: UserActionItemRow = {
  id: "a2", text: "Schedule quarterly review", created_at: "x",
  team_id: "t2", team_name: "Design Crew",
  board_id: null, board_title: null, board_team_id: null, board_team_name: null,
  can_manage: true,
};

const readOnlyBoardItem: UserActionItemRow = {
  ...boardItem, id: "a3", text: "Participant-visible item", can_manage: false,
};

function expand() {
  fireEvent.click(screen.getByRole("button", { name: /Open Action Items/ }));
}

describe("DashboardActionItems", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("starts collapsed, showing only the header and count", () => {
    render(<DashboardActionItems items={[boardItem, teamItem]} />);
    expect(screen.getByRole("button", { name: /Open Action Items/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("open-items-count").textContent).toBe("2");
    expect(screen.queryByText("Fix the deploy pipeline")).toBeNull();
  });

  it("expands to reveal every item when the header is clicked", () => {
    render(<DashboardActionItems items={[boardItem, teamItem]} />);
    expand();
    expect(screen.getByRole("button", { name: /Open Action Items/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Fix the deploy pipeline")).toBeInTheDocument();
    expect(screen.getByText("Schedule quarterly review")).toBeInTheDocument();
  });

  it("collapses again on a second click", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    expect(screen.getByText("Fix the deploy pipeline")).toBeInTheDocument();
    expand();
    expect(screen.queryByText("Fix the deploy pipeline")).toBeNull();
  });

  it("shows a board pill and a crew pill under a board item's text", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    expect(screen.getByText("Sprint 12").closest("a")).toHaveAttribute("href", "/app/board/b1");
    expect(screen.getByText("Design Crew").closest("a")).toHaveAttribute("href", "/app/crews/t1");
  });

  it("shows only a board pill when the board has no crew", () => {
    render(<DashboardActionItems items={[unassignedBoardItem]} />);
    expand();
    expect(screen.getByText("Sprint 12")).toBeInTheDocument();
    expect(screen.queryByText("Design Crew")).toBeNull();
  });

  it("shows only a crew pill under a team item's text", () => {
    render(<DashboardActionItems items={[teamItem]} />);
    expand();
    expect(screen.getByText("Design Crew").closest("a")).toHaveAttribute("href", "/app/crews/t2");
    expect(screen.queryByText("Sprint 12")).toBeNull();
  });

  it("checking a board item PATCHes the board's action-items route after the undo delay", () => {
    vi.useFakeTimers();
    try {
      render(<DashboardActionItems items={[boardItem]} />);
      expand();
      fireEvent.click(screen.getByRole("checkbox"));
      // Nothing is submitted during the grace window
      expect(mockSubmit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(mockSubmit).toHaveBeenCalledWith(
        { intent: "complete", itemId: "a1", completed: "true" },
        { method: "PATCH", action: "/app/board/b1/action-items" }
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("checking a team item posts toggleItem to the crew route after the undo delay", () => {
    vi.useFakeTimers();
    try {
      render(<DashboardActionItems items={[teamItem]} />);
      expand();
      fireEvent.click(screen.getByRole("checkbox"));
      expect(mockSubmit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(3000);
      expect(mockSubmit).toHaveBeenCalledWith(
        { intent: "toggleItem", itemId: "a2", completed: "true" },
        { method: "post", action: "/app/crews/t2" }
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks the item checked and shows a countdown bar during the grace window", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("undo-countdown")).toBeInTheDocument();
  });

  it("unchecking within the grace window cancels the submit and hides the bar", () => {
    vi.useFakeTimers();
    try {
      render(<DashboardActionItems items={[boardItem]} />);
      expand();
      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);            // start grace
      fireEvent.click(checkbox);            // undo
      expect(checkbox).toHaveAttribute("aria-checked", "false");
      expect(screen.queryByTestId("undo-countdown")).toBeNull();
      vi.advanceTimersByTime(3000);
      expect(mockSubmit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("edits an item via the hover edit button, just like double-click", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    fireEvent.click(screen.getByTitle("Edit action item"));
    const input = screen.getByDisplayValue("Fix the deploy pipeline");
    fireEvent.change(input, { target: { value: "Fix it via the button" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "text", itemId: "a1", text: "Fix it via the button" },
      { method: "PATCH", action: "/app/board/b1/action-items" }
    );
  });

  it("hides the edit button for items the user cannot manage", () => {
    render(<DashboardActionItems items={[readOnlyBoardItem]} />);
    expand();
    expect(screen.queryByTitle("Edit action item")).toBeNull();
  });

  it("double-click edits a board item and Enter saves via the board route", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    fireEvent.doubleClick(screen.getByText("Fix the deploy pipeline"));
    const input = screen.getByDisplayValue("Fix the deploy pipeline");
    fireEvent.change(input, { target: { value: "Fix the deploy pipeline for real" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "text", itemId: "a1", text: "Fix the deploy pipeline for real" },
      { method: "PATCH", action: "/app/board/b1/action-items" }
    );
  });

  it("double-click edits a team item and Enter saves via the crew route", () => {
    render(<DashboardActionItems items={[teamItem]} />);
    expand();
    fireEvent.doubleClick(screen.getByText("Schedule quarterly review"));
    const input = screen.getByDisplayValue("Schedule quarterly review");
    fireEvent.change(input, { target: { value: "Schedule the review" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "updateItem", itemId: "a2", text: "Schedule the review" },
      { method: "post", action: "/app/crews/t2" }
    );
  });

  it("Escape cancels an edit without saving", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    fireEvent.doubleClick(screen.getByText("Fix the deploy pipeline"));
    const input = screen.getByDisplayValue("Fix the deploy pipeline");
    fireEvent.change(input, { target: { value: "changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Fix the deploy pipeline")).toBeInTheDocument();
  });

  it("does not delete on the first click — it arms an inline confirm instead", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    fireEvent.click(screen.getByTitle("Delete action item"));
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("delete submits DELETE for board items and deleteItem for team items after confirming", () => {
    render(<DashboardActionItems items={[boardItem, teamItem]} />);
    expand();
    const deleteButtons = screen.getAllByTitle("Delete action item");
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockSubmit).toHaveBeenCalledWith(
      { itemId: "a1" },
      { method: "DELETE", action: "/app/board/b1/action-items" }
    );

    fireEvent.click(screen.getAllByTitle("Delete action item")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mockSubmit).toHaveBeenCalledWith(
      { intent: "deleteItem", itemId: "a2" },
      { method: "post", action: "/app/crews/t2" }
    );
  });

  it("cancel backs out of the delete confirmation without submitting", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    fireEvent.click(screen.getByTitle("Delete action item"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(screen.getByTitle("Delete action item")).toBeInTheDocument();
  });

  it("clicking outside the confirm also cancels it", () => {
    render(<DashboardActionItems items={[boardItem]} />);
    expand();
    fireEvent.click(screen.getByTitle("Delete action item"));
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(screen.getByTitle("Delete action item")).toBeInTheDocument();
  });

  it("hides edit and delete affordances when the user cannot manage the item", () => {
    render(<DashboardActionItems items={[readOnlyBoardItem]} />);
    expand();
    expect(screen.queryByTitle("Delete action item")).toBeNull();
    fireEvent.doubleClick(screen.getByText("Participant-visible item"));
    expect(screen.queryByDisplayValue("Participant-visible item")).toBeNull();
    // toggle is still available to any participant
    expect(screen.getByRole("checkbox")).toBeEnabled();
  });

  it("renders nothing when there are no open items", () => {
    const { container } = render(<DashboardActionItems items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("DashboardActionItems — crew-page props", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("starts open when defaultExpanded is set", () => {
    render(<DashboardActionItems items={[boardItem]} defaultExpanded />);
    expect(screen.getByRole("button", { name: /Open Action Items/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Fix the deploy pipeline")).toBeInTheDocument();
  });

  it("hides the crew pill when scopedTeamId is set (board pill stays)", () => {
    render(<DashboardActionItems items={[boardItem]} defaultExpanded scopedTeamId="t1" />);
    expect(screen.queryByText("Design Crew")).toBeNull();
    expect(screen.getByText("Sprint 12")).toBeInTheDocument();
  });

  it("shows an add row and calls onAddItem on Enter", () => {
    const onAddItem = vi.fn();
    render(<DashboardActionItems items={[teamItem]} defaultExpanded onAddItem={onAddItem} />);
    const input = screen.getByTestId("add-action-item-input");
    fireEvent.change(input, { target: { value: "New crew item" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddItem).toHaveBeenCalledWith("New crew item");
  });

  it("stays mounted with the add row even when there are no open items", () => {
    const onAddItem = vi.fn();
    render(<DashboardActionItems items={[]} defaultExpanded onAddItem={onAddItem} />);
    expect(screen.getByTestId("dashboard-action-items")).toBeInTheDocument();
    expect(screen.getByTestId("add-action-item-input")).toBeInTheDocument();
  });

  it("does not add on empty/whitespace input", () => {
    const onAddItem = vi.fn();
    render(<DashboardActionItems items={[]} defaultExpanded onAddItem={onAddItem} />);
    const input = screen.getByTestId("add-action-item-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddItem).not.toHaveBeenCalled();
  });
});

describe("DashboardActionItems — smooth removal", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("keeps a departed item visible until its exit transition finishes, then removes it", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<DashboardActionItems items={[boardItem, teamItem]} />);
      expand();
      expect(screen.getByText("Fix the deploy pipeline")).toBeInTheDocument();

      // Simulate the loader revalidating after this item was completed
      // (here, elsewhere, doesn't matter — it's just gone from `items` now).
      rerender(<DashboardActionItems items={[teamItem]} />);

      // Header count reflects the new total immediately...
      expect(screen.getByTestId("open-items-count").textContent).toBe("1");
      // ...but the row itself is still there, mid-transition.
      expect(screen.getByText("Fix the deploy pipeline")).toBeInTheDocument();

      // Not enough time for the exit transition to finish yet.
      act(() => { vi.advanceTimersByTime(100); });
      expect(screen.getByText("Fix the deploy pipeline")).toBeInTheDocument();

      // Past the transition duration — the row is gone.
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.queryByText("Fix the deploy pipeline")).toBeNull();
      expect(screen.getByText("Schedule quarterly review")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays mounted through the last item's exit animation instead of unmounting instantly", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<DashboardActionItems items={[boardItem]} />);
      expand();

      rerender(<DashboardActionItems items={[]} />);
      // Section (and the departing row) still present immediately after.
      expect(screen.getByTestId("dashboard-action-items")).toBeInTheDocument();
      expect(screen.getByText("Fix the deploy pipeline")).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.queryByTestId("dashboard-action-items")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
