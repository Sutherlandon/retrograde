// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

import { ActionItemsPanel } from "./ActionItemsPanel";

const baseBoard = {
  actionItems: [] as { id: string; text: string; completed: boolean; item_order: number; created_at: string }[],
  addActionItem: vi.fn(),
  updateActionItem: vi.fn(),
  toggleActionItem: vi.fn(),
  deleteActionItem: vi.fn(),
  canFacilitate: true,
  boardLocked: false,
};

function item(id: string, text: string, completed = false) {
  return { id, text, completed, item_order: 0, created_at: "x" };
}

describe("ActionItemsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue({ ...baseBoard });
  });

  afterEach(() => cleanup());

  it("renders objectives with a completion count and progress bar", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      actionItems: [item("1", "Ship it", true), item("2", "Test it")],
    });
    render(<ActionItemsPanel />);
    expect(screen.getByText("Action Items")).toBeInTheDocument();
    expect(screen.getByTestId("objective-count").textContent).toBe("1/2 complete");
    expect(screen.getByTestId("objective-progress").style.width).toBe("50%");
    expect(screen.getAllByTestId("objective-row")).toHaveLength(2);
  });

  it("toggles an objective through the checkbox", () => {
    const toggleActionItem = vi.fn();
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      toggleActionItem,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(toggleActionItem).toHaveBeenCalledWith("1", true);
  });

  it("adds an objective via the input for facilitators", () => {
    const addActionItem = vi.fn();
    mockUseBoard.mockReturnValue({ ...baseBoard, addActionItem });
    render(<ActionItemsPanel />);
    const input = screen.getByTestId("objective-input");
    fireEvent.change(input, { target: { value: "New follow-up" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(addActionItem).toHaveBeenCalledWith("New follow-up");
  });

  it("hides the add form from non-facilitators", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      canFacilitate: false,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    expect(screen.queryByTestId("objective-input")).toBeNull();
  });

  it("renders nothing at all for non-facilitators with zero objectives", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, canFacilitate: false, actionItems: [] });
    render(<ActionItemsPanel />);
    expect(screen.queryByTestId("action-items-panel")).toBeNull();
  });

  it("hides the column entirely when actionItemsVisible is false", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      actionItemsVisible: false,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    expect(screen.queryByTestId("action-items-panel")).toBeNull();
  });

  it("shows the column when actionItemsVisible is true", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      actionItemsVisible: true,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    expect(screen.getByTestId("action-items-panel")).toBeInTheDocument();
  });

  it("disables checkbox interactions when the board is locked", () => {
    const toggleActionItem = vi.fn();
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      boardLocked: true,
      toggleActionItem,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDisabled();
  });

  it("marks completed objectives with strikethrough styling", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      actionItems: [item("1", "Done thing", true)],
    });
    render(<ActionItemsPanel />);
    expect(screen.getByText("Done thing").className).toContain("line-through");
  });
});
