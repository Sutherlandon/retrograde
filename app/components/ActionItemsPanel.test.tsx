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
  canAddActionItems: true,
  addingActionItem: false,
  setAddingActionItem: vi.fn(),
  columns: [{ id: "c1" }, { id: "c2" }],
  addNote: vi.fn(),
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

  // Until the server answers, the item's id is local and would mean nothing there.
  it("can't be changed while it is still saving", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      actionItems: [{ ...item("local", "Ship it"), is_new: true }],
    });
    render(<ActionItemsPanel />);

    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit action item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete action item" })).toBeDisabled();

    fireEvent.doubleClick(screen.getByText("Ship it"));
    expect(screen.queryByDisplayValue("Ship it")).toBeNull();
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

  it("opens the draft from the add button", () => {
    render(<ActionItemsPanel />);
    expect(screen.queryByTestId("objective-input")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add action item" }));
    expect(baseBoard.setAddingActionItem).toHaveBeenCalledWith(true);
  });

  describe("draft row", () => {
    function typeDraft(text: string) {
      mockUseBoard.mockReturnValue({ ...baseBoard, addingActionItem: true });
      render(<ActionItemsPanel />);
      const input = screen.getByTestId("objective-input");
      fireEvent.change(input, { target: { value: text } });
      return input;
    }

    it("carries an unchecked check circle like a real item", () => {
      typeDraft("");
      expect(screen.getByTestId("objective-draft-row")).toBeInTheDocument();
    });

    it("saves and closes on Return, like a note", () => {
      fireEvent.keyDown(typeDraft("New follow-up"), { key: "Enter" });
      expect(baseBoard.addActionItem).toHaveBeenCalledExactlyOnceWith("New follow-up");
      expect(baseBoard.setAddingActionItem).toHaveBeenCalledWith(false);
    });

    it("adds a new line on Shift+Return", () => {
      const input = typeDraft("Line one");
      expect(fireEvent.keyDown(input, { key: "Enter", shiftKey: true })).toBe(true);
      expect(baseBoard.addActionItem).not.toHaveBeenCalled();
    });

    it("saves on Tab and stays open for the next item", () => {
      const input = typeDraft("New follow-up");
      expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
      expect(baseBoard.addActionItem).toHaveBeenCalledExactlyOnceWith("New follow-up");
      expect(baseBoard.setAddingActionItem).not.toHaveBeenCalledWith(false);
      expect(input).toHaveValue("");
    });

    it("saves on Shift+Tab and wraps to a new note in the first column", () => {
      const input = typeDraft("Last one");
      expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(false);
      expect(baseBoard.addActionItem).toHaveBeenCalledExactlyOnceWith("Last one");
      expect(baseBoard.setAddingActionItem).toHaveBeenCalledWith(false);
      expect(baseBoard.addNote).toHaveBeenCalledExactlyOnceWith("c1");
    });

    it("skips an empty draft on Shift+Tab", () => {
      fireEvent.keyDown(typeDraft(""), { key: "Tab", shiftKey: true });
      expect(baseBoard.addActionItem).not.toHaveBeenCalled();
      expect(baseBoard.addNote).toHaveBeenCalledExactlyOnceWith("c1");
    });

    it("commits a pending draft on blur", () => {
      fireEvent.blur(typeDraft("Wrap up"));
      expect(baseBoard.addActionItem).toHaveBeenCalledWith("Wrap up");
      expect(baseBoard.setAddingActionItem).toHaveBeenCalledWith(false);
    });

    it("cancels on Escape without adding", () => {
      fireEvent.keyDown(typeDraft("Never mind"), { key: "Escape" });
      expect(baseBoard.addActionItem).not.toHaveBeenCalled();
      expect(baseBoard.setAddingActionItem).toHaveBeenCalledWith(false);
    });
  });

  describe("editing a saved item", () => {
    function editItem(text: string) {
      mockUseBoard.mockReturnValue({ ...baseBoard, actionItems: [item("1", "Ship it")] });
      render(<ActionItemsPanel />);
      fireEvent.click(screen.getByTitle("Edit action item"));
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: text } });
      return input;
    }

    it("saves on Tab and opens the draft for a new item", () => {
      const input = editItem("Ship it today");
      expect(fireEvent.keyDown(input, { key: "Tab" })).toBe(false);
      expect(baseBoard.updateActionItem).toHaveBeenCalledExactlyOnceWith("1", "Ship it today");
      expect(baseBoard.setAddingActionItem).toHaveBeenCalledWith(true);
    });

    it("saves on Shift+Tab and wraps to a new note in the first column", () => {
      const input = editItem("Ship it today");
      expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(false);
      expect(baseBoard.updateActionItem).toHaveBeenCalledExactlyOnceWith("1", "Ship it today");
      expect(baseBoard.addNote).toHaveBeenCalledExactlyOnceWith("c1");
    });

    it("deletes an item saved empty, like a note", () => {
      fireEvent.keyDown(editItem("   "), { key: "Enter" });
      expect(baseBoard.deleteActionItem).toHaveBeenCalledExactlyOnceWith("1");
      expect(baseBoard.updateActionItem).not.toHaveBeenCalled();
    });
  });

  it("hides the add button and draft from non-facilitators", () => {
    mockUseBoard.mockReturnValue({
      ...baseBoard,
      canFacilitate: false,
      canAddActionItems: false,
      addingActionItem: true,
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
      canAddActionItems: false,
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
