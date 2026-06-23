// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Note as NoteType } from "~/server/board.types";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

vi.mock("~/context/userContext", () => ({
  useOptionalUser: () => null,
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

import Note from "./Note";

const baseBoard = {
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  likeNote: vi.fn(),
  voteNote: vi.fn(),
  votingEnabled: false,
  votingAllowed: 5,
  votingScope: "board" as const,
  columns: [],
  notesLocked: false,
  boardLocked: false,
};

function makeNote(overrides: Partial<NoteType> = {}): NoteType {
  return {
    id: "n1",
    column_id: "c1",
    text: "An idea",
    likes: 0,
    is_new: false,
    created: "1000",
    note_order: 0,
    ...overrides,
  };
}

describe("Note author footer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBoard.mockReturnValue(baseBoard);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an agent badge when the author is an AI agent", () => {
    render(
      <Note
        note={makeNote({
          author: { display_name: "Claude", is_agent: true },
        })}
        columnId="c1"
        noteColor="bg-yellow-200"
      />
    );
    const footer = screen.getByTestId("note-author");
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toContain("Claude");
    // Agent badge is an SVG robot icon (was previously an emoji — emojis
    // render inconsistently across browsers).
    expect(footer.querySelector("svg")).not.toBeNull();
    expect(footer.className).toContain("text-blue-700");
  });

  it("renders a plain human name without the agent marker", () => {
    render(
      <Note
        note={makeNote({
          author: { display_name: "Landon", is_agent: false },
        })}
        columnId="c1"
        noteColor="bg-yellow-200"
      />
    );
    const footer = screen.getByTestId("note-author");
    expect(footer.textContent).toContain("Landon");
    expect(footer.querySelector("svg")).toBeNull();
    expect(footer.className).toContain("text-slate-600");
  });

  it("renders nothing when the note has no author", () => {
    render(
      <Note
        note={makeNote({ author: null })}
        columnId="c1"
        noteColor="bg-yellow-200"
      />
    );
    expect(screen.queryByTestId("note-author")).toBeNull();
  });

  it("renders nothing when the author field is absent", () => {
    render(<Note note={makeNote()} columnId="c1" noteColor="bg-yellow-200" />);
    expect(screen.queryByTestId("note-author")).toBeNull();
  });
});
