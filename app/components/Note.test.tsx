// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Note as NoteType } from "~/server/board.types";

const mockUseBoard = vi.fn();
vi.mock("~/context/BoardContext", () => ({
  useBoard: () => mockUseBoard(),
}));

const userState = vi.hoisted(() => ({ current: null as { id: string; username: string } | null }));
vi.mock("~/context/userContext", () => ({
  useOptionalUser: () => userState.current,
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
  addNote: vi.fn(),
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
    userState.current = null;
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

describe("Note author preview while composing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userState.current = { id: "u1", username: "Ada" };
    mockUseBoard.mockReturnValue({ ...baseBoard, attributionEnabled: true });
  });

  afterEach(() => cleanup());

  it("previews the current user's name on a new note being typed when attribution is on", () => {
    render(<Note note={makeNote({ is_new: true })} columnId="c1" noteColor="bg-yellow-200" />);
    const preview = screen.getByTestId("note-author-preview");
    expect(preview.textContent).toContain("Ada");
  });

  it("shows no preview when attribution is off", () => {
    mockUseBoard.mockReturnValue({ ...baseBoard, attributionEnabled: false });
    render(<Note note={makeNote({ is_new: true })} columnId="c1" noteColor="bg-yellow-200" />);
    expect(screen.queryByTestId("note-author-preview")).toBeNull();
  });

  it("shows no preview when there is no signed-in user", () => {
    userState.current = null;
    render(<Note note={makeNote({ is_new: true })} columnId="c1" noteColor="bg-yellow-200" />);
    expect(screen.queryByTestId("note-author-preview")).toBeNull();
  });
});

describe("Note hotkeys", () => {
  const columns = [{ id: "c1", notes: [] }, { id: "c2", notes: [] }, { id: "c3", notes: [] }];
  const board = { ...baseBoard, columns };

  function editNote(columnId: string, text = "An idea") {
    render(<Note note={makeNote({ is_new: true, text })} columnId={columnId} noteColor="bg-yellow-200" />);
    return screen.getByRole("textbox");
  }

  beforeEach(() => {
    vi.clearAllMocks();
    userState.current = null;
    mockUseBoard.mockReturnValue(board);
  });

  afterEach(() => {
    cleanup();
  });

  it("saves on Return without starting another note", () => {
    fireEvent.keyDown(editNote("c1"), { key: "Enter" });
    expect(board.updateNote).toHaveBeenCalledWith("c1", "n1", "An idea", 0, "1000");
    expect(board.addNote).not.toHaveBeenCalled();
  });

  it("leaves Shift+Return to the textarea so it adds a new line", () => {
    const textarea = editNote("c1");
    const notPrevented = fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(notPrevented).toBe(true);
    expect(board.updateNote).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toBe(textarea);
  });

  it("saves on Tab and starts a new note in the same column", () => {
    const notPrevented = fireEvent.keyDown(editNote("c2"), { key: "Tab" });
    expect(notPrevented).toBe(false);
    expect(board.updateNote).toHaveBeenCalledWith("c2", "n1", "An idea", 0, "1000");
    expect(board.addNote).toHaveBeenCalledExactlyOnceWith("c2");
  });

  it("saves on Shift+Tab and starts a new note in the next column", () => {
    const notPrevented = fireEvent.keyDown(editNote("c1"), { key: "Tab", shiftKey: true });
    expect(notPrevented).toBe(false);
    expect(board.updateNote).toHaveBeenCalledWith("c1", "n1", "An idea", 0, "1000");
    expect(board.addNote).toHaveBeenCalledExactlyOnceWith("c2");
  });

  it("wraps Shift+Tab from the last column back to the first", () => {
    fireEvent.keyDown(editNote("c3"), { key: "Tab", shiftKey: true });
    expect(board.addNote).toHaveBeenCalledExactlyOnceWith("c1");
  });

  it("discards an empty draft and still moves on, so Shift+Tab can skip a column", () => {
    fireEvent.keyDown(editNote("c1", ""), { key: "Tab", shiftKey: true });
    expect(board.deleteNote).toHaveBeenCalledWith("c1", "n1");
    expect(board.updateNote).not.toHaveBeenCalled();
    expect(board.addNote).toHaveBeenCalledExactlyOnceWith("c2");
  });

  it("drops a new note on Esc, even with text typed into it", () => {
    fireEvent.keyDown(editNote("c1", "Half a thought"), { key: "Escape" });
    expect(board.deleteNote).toHaveBeenCalledExactlyOnceWith("c1", "n1");
    expect(board.updateNote).not.toHaveBeenCalled();
    expect(board.addNote).not.toHaveBeenCalled();
  });

  it("puts a saved note back as it was on Esc, writing nothing", () => {
    render(<Note note={makeNote({ text: "Keep me" })} columnId="c1" noteColor="bg-yellow-200" />);
    fireEvent.doubleClick(screen.getByText("Keep me"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Changed my mind" } });

    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Keep me")).toBeInTheDocument();
    expect(board.updateNote).not.toHaveBeenCalled();
    expect(board.deleteNote).not.toHaveBeenCalled();

    fireEvent.doubleClick(screen.getByText("Keep me"));
    expect(screen.getByRole("textbox")).toHaveValue("Keep me");
  });
});
