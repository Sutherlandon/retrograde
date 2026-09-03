// app/components/Column.test.tsx
// Covers GAP-009 / BRD-012, BRD-013: the column menu (prompt edit, delete
// column) must gate on canFacilitate, not isOwner, so a granted facilitator
// who is not the board owner still sees the controls.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

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
