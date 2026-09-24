// @vitest-environment jsdom
// Covers DECK-007 (sort notes by score): the real score = votes/likes rule
// lives here in BoardContext.sortNotesByScore, not in CommandDeck (which just
// calls it). CommandDeck.test.tsx covers the button wiring; this file covers
// the actual sort + tie-break behavior and the reorder call it fires.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { BoardDTO, NoteDTO } from "~/server/board.types";

const mockLoaderData = vi.fn();
vi.mock("react-router", () => ({
  useLoaderData: () => mockLoaderData(),
  useFetcher: () => ({ submit: vi.fn(), load: vi.fn(), data: null, state: "idle" as const }),
}));

import { BoardProvider, useBoard } from "./BoardContext";

function TestConsumer() {
  const { columns, sortNotesByScore } = useBoard();
  return (
    <div>
      <button onClick={sortNotesByScore}>sort</button>
      <ol data-testid="order">
        {columns[0].notes.map((n) => (
          <li key={n.id}>{n.id}</li>
        ))}
      </ol>
    </div>
  );
}

function note(id: string, overrides: Partial<NoteDTO> = {}): NoteDTO {
  return {
    id,
    column_id: "c1",
    text: id,
    likes: 0,
    votes: 0,
    user_votes: 0,
    is_new: false,
    created: "2024-01-01T00:00:00.000Z",
    note_order: 0,
    ...overrides,
  };
}

function baseLoaderData(notes: NoteDTO[], votingEnabled = false): BoardDTO {
  return {
    id: "board-1",
    title: "Test board",
    readonly: false,
    timerRunning: false,
    timerStartedAt: null,
    timerEndsAt: null,
    votingEnabled,
    columns: [{ id: "c1", title: "Col 1", prompt: "", col_order: 0, notes }],
  };
}

describe("BoardContext.sortNotesByScore (DECK-007)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("orders notes by likes descending when voting is disabled (DECK-007)", () => {
    mockLoaderData.mockReturnValue(
      baseLoaderData(
        [
          note("low", { likes: 1 }),
          note("high", { likes: 5 }),
          note("mid", { likes: 3 }),
        ],
        false
      )
    );
    render(
      <BoardProvider>
        <TestConsumer />
      </BoardProvider>
    );

    fireEvent.click(screen.getByText("sort"));

    const ids = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(ids).toEqual(["high", "mid", "low"]);
  });

  it("orders notes by votes (not likes) descending when voting is enabled (DECK-007)", () => {
    mockLoaderData.mockReturnValue(
      baseLoaderData(
        [
          note("a", { likes: 99, votes: 1 }),
          note("b", { likes: 0, votes: 8 }),
          note("c", { likes: 50, votes: 4 }),
        ],
        true
      )
    );
    render(
      <BoardProvider>
        <TestConsumer />
      </BoardProvider>
    );

    fireEvent.click(screen.getByText("sort"));

    const ids = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(ids).toEqual(["b", "c", "a"]);
  });

  it("breaks a score tie by earliest-created first (DECK-007)", () => {
    mockLoaderData.mockReturnValue(
      baseLoaderData(
        [
          note("newer", { likes: 2, created: "2024-01-03T00:00:00.000Z" }),
          note("older", { likes: 2, created: "2024-01-01T00:00:00.000Z" }),
          note("middle", { likes: 2, created: "2024-01-02T00:00:00.000Z" }),
        ],
        false
      )
    );
    render(
      <BoardProvider>
        <TestConsumer />
      </BoardProvider>
    );

    fireEvent.click(screen.getByText("sort"));

    const ids = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(ids).toEqual(["older", "middle", "newer"]);
  });

  it("persists the new order to the server via a reorder PATCH (DECK-007)", () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    mockLoaderData.mockReturnValue(
      baseLoaderData([note("low", { likes: 1 }), note("high", { likes: 5 })], false)
    );
    render(
      <BoardProvider>
        <TestConsumer />
      </BoardProvider>
    );

    fireEvent.click(screen.getByText("sort"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/app/board/board-1/notes",
      expect.objectContaining({ method: "PATCH" })
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(body.get("intent")).toBe("reorder");
    expect(body.get("toColumnId")).toBe("c1");
    expect(JSON.parse(body.get("orderedNoteIds")!)).toEqual(["high", "low"]);
  });
});
