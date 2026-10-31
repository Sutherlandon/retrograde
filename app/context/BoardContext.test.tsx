// @vitest-environment jsdom
// Covers DECK-007 (sort notes by score): the real score = votes/likes rule
// lives here in BoardContext.sortNotesByScore, not in CommandDeck (which just
// calls it). CommandDeck.test.tsx covers the button wiring; this file covers
// the actual sort + tie-break behavior and the reorder call it fires. Also
// covers mutation responses landing on top of a local-only draft note (#123)
// and note and title saves landing back to back, which Tab makes routine.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { BoardDTO, NoteDTO } from "~/server/board.types";

const mockLoaderData = vi.fn();

// BoardProvider creates its fetchers in a fixed order, so a fetcher's index
// lets a test deliver a server response to that specific fetcher.
const COLUMN_FETCHER = 0;
const NOTE_FETCHER = 1;
const fetcherData = new Map<number, unknown>();
let nextFetcher = 0;

vi.mock("react-router", async () => {
  const { useState } = await import("react");
  return {
    useLoaderData: () => mockLoaderData(),
    useFetcher: () => {
      const [index] = useState(() => nextFetcher++);
      return { submit: vi.fn(), load: vi.fn(), data: fetcherData.get(index) ?? null, state: "idle" as const };
    },
  };
});

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

function DraftConsumer() {
  const { columns, addNote, updateNote } = useBoard();
  return (
    <div>
      <button onClick={() => updateNote("c1", "saved", "edited", 0, "2024-01-01T00:00:00.000Z")}>save</button>
      <button onClick={() => addNote("c1")}>add</button>
      <ol>
        {columns[0].notes.map((n) => (
          <li key={n.id}>{n.is_new ? "draft" : n.text}</li>
        ))}
      </ol>
    </div>
  );
}

describe("BoardContext draft notes across mutation responses (#123)", () => {
  // A function, not a shared element: React skips re-rendering an identical
  // element, and the provider has to re-render to read the fetcher response.
  const tree = () => (
    <BoardProvider>
      <DraftConsumer />
    </BoardProvider>
  );
  const notes = () => screen.getAllByRole("listitem").map((li) => li.textContent);

  beforeEach(() => {
    nextFetcher = 0;
    fetcherData.clear();
    mockLoaderData.mockReturnValue(baseLoaderData([note("saved", { text: "original" })]));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps a draft added while the edited note's save is in flight", async () => {
    // A click on Add blurs the note being edited, so the save starts first.
    let respond = (_res: unknown) => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { respond = resolve; })));
    render(tree());
    fireEvent.click(screen.getByText("save"));
    fireEvent.click(screen.getByText("add"));
    expect(notes()).toEqual(["edited", "draft"]);

    const saved = baseLoaderData([note("saved", { text: "edited" })]);
    await act(async () => respond({ ok: true, json: async () => saved }));

    expect(notes()).toEqual(["edited", "draft"]);
  });

  it("keeps a draft when a note mutation responds", () => {
    const { rerender } = render(tree());
    fireEvent.click(screen.getByText("add"));

    fetcherData.set(NOTE_FETCHER, baseLoaderData([note("saved", { text: "original" })]));
    rerender(tree());

    expect(notes()).toEqual(["original", "draft"]);
  });

  it("keeps a draft when a column mutation responds", () => {
    const { rerender } = render(tree());
    fireEvent.click(screen.getByText("add"));

    fetcherData.set(COLUMN_FETCHER, baseLoaderData([note("saved", { text: "original" })]));
    rerender(tree());

    expect(notes()).toEqual(["original", "draft"]);
  });

  it("drops a note the server response no longer has", () => {
    const { rerender } = render(tree());

    fetcherData.set(NOTE_FETCHER, baseLoaderData([]));
    rerender(tree());

    expect(screen.queryAllByRole("listitem")).toEqual([]);
  });
});

function BurstConsumer() {
  const { columns, updateNote, updateColumnTitle } = useBoard();
  return (
    <div>
      <button
        onClick={() => {
          updateNote("c1", "first", "one", 0, "t");
          updateNote("c1", "second", "two", 0, "t");
        }}
      >
        save notes
      </button>
      <button
        onClick={() => {
          updateColumnTitle("c1", "Renamed");
          updateColumnTitle("c2", "Also renamed");
        }}
      >
        save titles
      </button>
      <ol>
        {columns.flatMap((c) => [c, ...c.notes]).map((item) => (
          <li key={item.id}>{"title" in item ? item.title : item.text}</li>
        ))}
      </ol>
    </div>
  );
}

// A fetcher cancels its in-flight request when it submits again, so a save
// that went through one could die before reaching the server.
describe("BoardContext back-to-back saves", () => {
  const twoColumns = (notes: NoteDTO[], secondTitle = "Col 2"): BoardDTO => ({
    ...baseLoaderData(notes),
    columns: [
      { id: "c1", title: "Col 1", prompt: "", col_order: 0, notes },
      { id: "c2", title: secondTitle, prompt: "", col_order: 1, notes: [] },
    ],
  });
  const items = () => screen.getAllByRole("listitem").map((li) => li.textContent);
  const requests = (fetchMock: ReturnType<typeof vi.fn>) =>
    fetchMock.mock.calls.map(([url, init]) => [url, init.method, Object.fromEntries(init.body)]);

  beforeEach(() => {
    nextFetcher = 0;
    fetcherData.clear();
    mockLoaderData.mockReturnValue(twoColumns([]));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function deferredFetch() {
    const responses: ((res: unknown) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise((resolve) => responses.push(resolve)));
    vi.stubGlobal("fetch", fetchMock);
    return { fetchMock, responses };
  }

  it("sends every note save in a burst", () => {
    const { fetchMock } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);

    fireEvent.click(screen.getByText("save notes"));

    expect(requests(fetchMock)).toEqual([
      ["/app/board/board-1/notes", "PATCH", { noteId: "first", columnId: "c1", text: "one", likes: "0", created: "t" }],
      ["/app/board/board-1/notes", "PATCH", { noteId: "second", columnId: "c1", text: "two", likes: "0", created: "t" }],
    ]);
  });

  it("sends every column title save in a burst", () => {
    const { fetchMock } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);

    fireEvent.click(screen.getByText("save titles"));

    expect(requests(fetchMock)).toEqual([
      ["/app/board/board-1/columns", "PATCH", { columnId: "c1", title: "Renamed" }],
      ["/app/board/board-1/columns", "PATCH", { columnId: "c2", title: "Also renamed" }],
    ]);
  });

  it("applies only the last response of a burst, which reflects every save", async () => {
    const { responses } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);
    fireEvent.click(screen.getByText("save titles"));
    expect(items()).toEqual(["Renamed", "Also renamed"]);

    // The first response predates the second save and still has its old title.
    await act(async () => responses[0]({ ok: true, json: async () => twoColumns([]) }));
    expect(items()).toEqual(["Renamed", "Also renamed"]);

    const saved = { ...twoColumns([note("from-server", { text: "server note" })], "Also renamed") };
    saved.columns[0].title = "Renamed";
    await act(async () => responses[1]({ ok: true, json: async () => saved }));
    expect(items()).toEqual(["Renamed", "server note", "Also renamed"]);
  });

  it("leaves the optimistic state alone when a save fails, for the poll to reconcile", async () => {
    const { responses } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);
    fireEvent.click(screen.getByText("save titles"));

    await act(async () => responses[0]({ ok: false }));
    await act(async () => responses[1]({ ok: false }));

    expect(items()).toEqual(["Renamed", "Also renamed"]);
  });
});
