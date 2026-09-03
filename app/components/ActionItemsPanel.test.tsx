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

  it("renders objectives with a completion count and progress bar (BRD-015)", () => {
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

  it("edits an objective via the hover edit button", () => {
    const updateActionItem = vi.fn();
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      updateActionItem,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Edit action item" }));
    const input = screen.getByDisplayValue("Ship it");
    fireEvent.change(input, { target: { value: "Ship it now" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(updateActionItem).toHaveBeenCalledWith("1", "Ship it now");
  });

  it("does not save on Shift+Enter (newline instead)", () => {
    const updateActionItem = vi.fn();
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      updateActionItem,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Edit action item" }));
    const field = screen.getByDisplayValue("Ship it");
    expect(field.tagName).toBe("TEXTAREA");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(updateActionItem).not.toHaveBeenCalled();
  });

  it("hides the edit button from non-facilitators", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      canFacilitate: false,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    expect(screen.queryByRole("button", { name: "Edit action item" })).toBeNull();
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

  it("reveals a draft row with a check circle and text field when the add button is clicked", () => {
    render(<ActionItemsPanel />);
    // No draft input until the plus is clicked
    expect(screen.queryByTestId("objective-input")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add action item" }));
    const input = screen.getByTestId("objective-input");
    expect(input).toBeInTheDocument();
    // The draft row carries an (unchecked) check circle like a real item
    expect(screen.getByTestId("objective-draft-row")).toBeInTheDocument();
  });

  it("adds an objective from the draft row on Enter and stays open for rapid entry", () => {
    const addActionItem = vi.fn();
    mockUseBoard.mockReturnValue({ ...baseBoard, addActionItem });
    render(<ActionItemsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add action item" }));
    const input = screen.getByTestId("objective-input");
    fireEvent.change(input, { target: { value: "New follow-up" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(addActionItem).toHaveBeenCalledWith("New follow-up");
    // Draft row stays open (cleared) so another item can be added
    expect(screen.getByTestId("objective-input")).toHaveValue("");
  });

  it("commits a pending draft on blur", () => {
    const addActionItem = vi.fn();
    mockUseBoard.mockReturnValue({ ...baseBoard, addActionItem });
    render(<ActionItemsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add action item" }));
    const input = screen.getByTestId("objective-input");
    fireEvent.change(input, { target: { value: "Wrap up" } });
    fireEvent.blur(input);
    expect(addActionItem).toHaveBeenCalledWith("Wrap up");
    expect(screen.queryByTestId("objective-input")).toBeNull();
  });

  it("cancels the draft on Escape without adding", () => {
    const addActionItem = vi.fn();
    mockUseBoard.mockReturnValue({ ...baseBoard, addActionItem });
    render(<ActionItemsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add action item" }));
    const input = screen.getByTestId("objective-input");
    fireEvent.change(input, { target: { value: "Never mind" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(addActionItem).not.toHaveBeenCalled();
    expect(screen.queryByTestId("objective-input")).toBeNull();
  });

  it("hides the add button and draft from non-facilitators", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      canFacilitate: false,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    expect(screen.queryByRole("button", { name: "Add action item" })).toBeNull();
    expect(screen.queryByTestId("objective-input")).toBeNull();
  });

  it("hides the add button when the board is locked", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      boardLocked: true,
      actionItems: [item("1", "Ship it")],
    });
    render(<ActionItemsPanel />);
    expect(screen.queryByRole("button", { name: "Add action item" })).toBeNull();
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
