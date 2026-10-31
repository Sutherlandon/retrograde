// app/components/Column.test.tsx
// Covers GAP-009 / BRD-012, BRD-013: the column menu (prompt edit, delete
// column) must gate on canFacilitate, not isOwner, so a granted facilitator
// who is not the board owner still sees the controls. Also covers renaming
// columns from the keyboard: titles are tab stops and Tab hops between them.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

const mockUseBoard = vi.fn();
vi.mock("../context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

import Column from "./Column";
import type { Column as ColumnType } from "~/server/board.types";

const baseBoard = {
  updateColumnTitle: vi.fn(),
  updateColumnPrompt: vi.fn(),
  deleteColumn: vi.fn(),
  addNote: vi.fn(),
  notesLocked: false,
  boardLocked: false,
  canFacilitate: true,
};

function makeColumn(overrides: Partial<ColumnType> = {}): ColumnType {
  return {
    id: "col-1",
    title: "To Discuss",
    prompt: "",
    col_order: 0,
    notes: [],
    ...overrides,
  };
}

describe("Column", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue({ ...baseBoard });
  });

  afterEach(() => cleanup());

  it("shows the column menu to a granted facilitator who is not the owner", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, canFacilitate: true });
    render(<Column column={makeColumn()} noteColor="bg-yellow-200" />);
    // Add-note button plus the ellipsis menu button both render.
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);
  });

  it("hides the column menu from a plain participant", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, canFacilitate: false });
    render(<Column column={makeColumn()} noteColor="bg-yellow-200" />);
    // Only the add-note button remains (menu button gone).
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(1);
  });

  it("hides the column menu when the board is locked even for a facilitator", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, canFacilitate: true, boardLocked: true });
    render(<Column column={makeColumn()} noteColor="bg-yellow-200" />);
    const buttons = screen.queryAllByRole("button");
    expect(buttons.length).toBe(0);
  });
});

describe("Column title keyboard renaming", () => {
  function renderColumns() {
    render(
      <>
        <Column column={makeColumn({ id: "col-1", title: "One" })} noteColor="bg-yellow-200" />
        <Column column={makeColumn({ id: "col-2", title: "Two" })} noteColor="bg-yellow-200" />
        <Column column={makeColumn({ id: "col-3", title: "Three" })} noteColor="bg-yellow-200" />
      </>
    );
  }

  function focusTitle(title: string) {
    fireEvent.focus(screen.getByText(title));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe(title);
    return input;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue({ ...baseBoard });
  });

  afterEach(() => cleanup());

  it("makes the title a tab stop", () => {
    renderColumns();
    expect(screen.getByText("One")).toHaveAttribute("tabindex", "0");
  });

  it("is not a tab stop while titles cannot be edited", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, notesLocked: true });
    renderColumns();
    expect(screen.getByText("One")).not.toHaveAttribute("tabindex");
    fireEvent.focus(screen.getByText("One"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens the title for renaming with its text selected when focused", () => {
    renderColumns();
    act(() => screen.getByText("One").focus());
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
  });

  it("saves and moves straight to the next column's title on Tab", () => {
    renderColumns();
    const input = focusTitle("One");
    fireEvent.change(input, { target: { value: "Renamed" } });

    const notPrevented = fireEvent.keyDown(input, { key: "Tab" });

    expect(notPrevented).toBe(false);
    expect(baseBoard.updateColumnTitle).toHaveBeenCalledExactlyOnceWith("col-1", "Renamed");
    expect(screen.getByRole("textbox")).toHaveValue("Two");
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("moves to the previous column's title on Shift+Tab", () => {
    renderColumns();
    const input = focusTitle("Two");
    expect(fireEvent.keyDown(input, { key: "Tab", shiftKey: true })).toBe(false);
    expect(screen.getByRole("textbox")).toHaveValue("One");
  });

  it("leaves Tab to the browser past the last column so focus can leave the titles", () => {
    renderColumns();
    expect(fireEvent.keyDown(focusTitle("Three"), { key: "Tab" })).toBe(true);
  });

  it("leaves Shift+Tab to the browser before the first column", () => {
    renderColumns();
    expect(fireEvent.keyDown(focusTitle("One"), { key: "Tab", shiftKey: true })).toBe(true);
  });

  it("does not write a title that was tabbed through unchanged", () => {
    renderColumns();
    fireEvent.keyDown(focusTitle("One"), { key: "Tab" });
    expect(baseBoard.updateColumnTitle).not.toHaveBeenCalled();
  });

  it("puts the title back on Esc, writing nothing", () => {
    renderColumns();
    const input = focusTitle("One");
    fireEvent.change(input, { target: { value: "Renamed" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(baseBoard.updateColumnTitle).not.toHaveBeenCalled();
    expect(focusTitle("One").value).toBe("One");
  });
});

describe("Column prompt editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue({ ...baseBoard, canFacilitate: true });
  });

  afterEach(() => cleanup());

  function editPrompt() {
    render(<Column column={makeColumn({ prompt: "Original" })} noteColor="bg-yellow-200" />);
    fireEvent.click(screen.getAllByRole("button")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Prompt Text" }));
    const textarea = screen.getByPlaceholderText("Enter additional prompt text...");
    fireEvent.change(textarea, { target: { value: "Changed" } });
    return textarea;
  }

  function reopenedPrompt() {
    expect(screen.queryByPlaceholderText("Enter additional prompt text...")).toBeNull();
    fireEvent.click(screen.getAllByRole("button")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Prompt Text" }));
    return screen.getByPlaceholderText("Enter additional prompt text...");
  }

  it("puts the prompt back on Esc, writing nothing", () => {
    fireEvent.keyDown(editPrompt(), { key: "Escape" });
    expect(reopenedPrompt()).toHaveValue("Original");
    expect(baseBoard.updateColumnPrompt).not.toHaveBeenCalled();
  });

  it("puts the prompt back on Abort too", () => {
    editPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Abort" }));
    expect(reopenedPrompt()).toHaveValue("Original");
  });
});
