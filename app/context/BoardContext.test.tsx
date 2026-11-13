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
const SETTINGS_FETCHER = 3;
const fetcherData = new Map<number, unknown>();
const fetcherState = new Map<number, string>();
let nextFetcher = 0;

vi.mock("react-router", async () => {
  const { useState } = await import("react");
  return {
    useLoaderData: () => mockLoaderData(),
    useFetcher: () => {
      const [index] = useState(() => nextFetcher++);
      return { submit: vi.fn(), load: vi.fn(), data: fetcherData.get(index) ?? null, state: (fetcherState.get(index) ?? "idle") as "idle" | "submitting" };
    },
  };
});

import { BoardProvider, useBoard, POLL_INTERVAL_MS, FULL_REFRESH_MS } from "./BoardContext";

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
  const { columns, updateNote, deleteNote, updateColumnTitle, addActionItem, updateActionItem, actionItems } = useBoard();
  return (
    <div>
      <button onClick={() => deleteNote("c1", "first")}>delete note</button>
      <button
        onClick={() => {
          addActionItem("first item");
          addActionItem("second item");
        }}
      >
        add items
      </button>
      <button
        onClick={() => {
          updateActionItem("a1", "edited");
          addActionItem("third item");
        }}
      >
        edit item
      </button>
      <button onClick={() => addActionItem("one item")}>add one item</button>
      <output data-testid="action-items">{actionItems.map((i) => i.text).join(", ")}</output>
      <output data-testid="unsaved-items">{actionItems.filter((i) => i.is_new).map((i) => i.text).join(", ")}</output>
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

  it("deletes a saved note on the server, so the poll can't bring it back", () => {
    mockLoaderData.mockReturnValue(twoColumns([note("first", { text: "saved" })]));
    const { fetchMock } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);

    fireEvent.click(screen.getByText("delete note"));

    expect(items()).not.toContain("saved");
    expect(requests(fetchMock)).toEqual([
      ["/app/board/board-1/notes", "DELETE", { noteId: "first", columnId: "c1" }],
    ]);
  });

  it("writes nothing when dropping a new note, which has no row on the server", () => {
    mockLoaderData.mockReturnValue(twoColumns([note("first", { text: "", is_new: true })]));
    const { fetchMock } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);

    fireEvent.click(screen.getByText("delete note"));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  const savedItems = (...texts: string[]) => versionedItems(undefined, ...texts);
  const versionedItems = (version: number | undefined, ...texts: string[]) => ({
    ok: true,
    json: async () => ({
      ...twoColumns([]),
      version,
      actionItems: texts.map((text, i) => ({ id: `a${i}`, text, completed: false, item_order: i, created_at: "t" })),
    }),
  });

  // The server numbers an item when it arrives, so overlapping adds could land
  // out of order or share a number.
  it("adds action items one at a time, in the order they were typed", async () => {
    const { fetchMock, responses } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);

    fireEvent.click(screen.getByText("add items"));
    await act(async () => {});
    expect(requests(fetchMock)).toEqual([
      ["/app/board/board-1/action-items", "POST", { text: "first item" }],
    ]);

    await act(async () => responses[0](savedItems("first item")));
    expect(screen.getByTestId("action-items")).toHaveTextContent("first item");
    expect(requests(fetchMock)[1]).toEqual(["/app/board/board-1/action-items", "POST", { text: "second item" }]);

    await act(async () => responses[1](savedItems("first item", "second item")));
    expect(screen.getByTestId("action-items")).toHaveTextContent("first item, second item");
  });

  it("shows a new action item straight away, marked unsaved until the server answers", async () => {
    const { responses } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);

    fireEvent.click(screen.getByText("add one item"));
    expect(screen.getByTestId("action-items")).toHaveTextContent("one item");
    expect(screen.getByTestId("unsaved-items")).toHaveTextContent("one item");

    await act(async () => {});
    await act(async () => responses[0](savedItems("one item")));

    expect(screen.getByTestId("action-items").textContent).toBe("one item");
    expect(screen.getByTestId("unsaved-items").textContent).toBe("");
  });

  it("keeps a queued action item on screen when the add before it answers", async () => {
    const { responses } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);
    fireEvent.click(screen.getByText("add items"));
    await act(async () => {});

    await act(async () => responses[0](savedItems("first item")));

    expect(screen.getByTestId("action-items").textContent).toBe("first item, second item");
  });

  // The poll runs every second, so on a slow server it often overlaps a save
  // and comes back without what was just saved.
  describe("a poll that overlaps a save", () => {
    const poll = () => act(async () => { vi.advanceTimersByTime(POLL_INTERVAL_MS); });

    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("leaves a new action item alone when it answers during the save", async () => {
      const { responses } = deferredFetch();
      render(<BoardProvider><BurstConsumer /></BoardProvider>);
      fireEvent.click(screen.getByText("add one item"));
      await act(async () => {});

      await poll();
      await act(async () => responses[1](savedItems()));

      expect(screen.getByTestId("action-items").textContent).toBe("one item");
    });

    // The poll predates the save, so only the version says it is the older one.
    it("leaves a saved action item alone when it answers after the save", async () => {
      mockLoaderData.mockReturnValue({ ...twoColumns([]), version: 1 });
      const { responses } = deferredFetch();
      render(<BoardProvider><BurstConsumer /></BoardProvider>);
      await poll();
      fireEvent.click(screen.getByText("add one item"));
      await act(async () => {});

      await act(async () => responses[1](versionedItems(2, "one item")));
      await act(async () => responses[0](versionedItems(1)));

      expect(screen.getByTestId("action-items").textContent).toBe("one item");
    });

    it("leaves a just-saved note alone", async () => {
      mockLoaderData.mockReturnValue(twoColumns([note("first", { text: "draft" })]));
      const { responses } = deferredFetch();
      render(<BoardProvider><BurstConsumer /></BoardProvider>);
      fireEvent.click(screen.getByText("save notes"));

      await poll();
      await act(async () => responses[2]({ ok: true, json: async () => twoColumns([]) }));

      expect(items()).toContain("one");
    });

    it("doesn't bring back a note that was just deleted", async () => {
      mockLoaderData.mockReturnValue(twoColumns([note("first", { text: "saved" })]));
      const { responses } = deferredFetch();
      render(<BoardProvider><BurstConsumer /></BoardProvider>);
      fireEvent.click(screen.getByText("delete note"));

      await poll();
      await act(async () => responses[1]({ ok: true, json: async () => twoColumns([note("first", { text: "saved" })]) }));

      expect(items()).not.toContain("saved");
    });

    it("is the only poll skipped, so the next one still brings the board up to date", async () => {
      const { responses } = deferredFetch();
      render(<BoardProvider><BurstConsumer /></BoardProvider>);
      fireEvent.click(screen.getByText("add one item"));
      await act(async () => {});
      await poll();
      await act(async () => responses[1](savedItems()));
      await act(async () => responses[0](savedItems("one item")));

      await poll();
      await act(async () => responses[2](savedItems("one item", "from someone else")));

      expect(screen.getByTestId("action-items").textContent).toBe("one item, from someone else");
    });
  });

  it("sends an action item edit straight away, alongside an add", async () => {
    const { fetchMock } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);

    fireEvent.click(screen.getByText("edit item"));
    await act(async () => {});

    expect(requests(fetchMock)).toEqual([
      ["/app/board/board-1/action-items", "PATCH", { intent: "text", itemId: "a1", text: "edited" }],
      ["/app/board/board-1/action-items", "POST", { text: "third item" }],
    ]);
  });

  it("carries on with the next add when one fails", async () => {
    const { fetchMock, responses } = deferredFetch();
    render(<BoardProvider><BurstConsumer /></BoardProvider>);
    fireEvent.click(screen.getByText("add items"));
    await act(async () => {});

    await act(async () => responses[0]({ ok: false }));

    expect(requests(fetchMock)[1]).toEqual(["/app/board/board-1/action-items", "POST", { text: "second item" }]);
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

function ActionItemDraftConsumer() {
  const { canAddActionItems, addingActionItem, setAddingActionItem } = useBoard();
  return (
    <button onClick={() => setAddingActionItem(true)}>
      {`can add: ${canAddActionItems}, adding: ${addingActionItem}`}
    </button>
  );
}

describe("BoardContext action item draft", () => {
  const renderWith = (overrides: Partial<BoardDTO>) => {
    nextFetcher = 0;
    fetcherData.clear();
    mockLoaderData.mockReturnValue({ ...baseLoaderData([]), canFacilitate: true, ...overrides });
    render(<BoardProvider><ActionItemDraftConsumer /></BoardProvider>);
  };

  afterEach(() => cleanup());

  it("lets a note open the draft, shared through the context", () => {
    renderWith({});
    fireEvent.click(screen.getByText("can add: true, adding: false"));
    expect(screen.getByText("can add: true, adding: true")).toBeInTheDocument();
  });

  it.each([
    ["a participant", { canFacilitate: false }],
    ["a locked board", { boardLocked: true }],
    ["a hidden panel", { actionItemsVisible: false }],
  ])("is unavailable to %s, so Shift+Tab skips Action Items", (_, overrides) => {
    renderWith(overrides);
    expect(screen.getByRole("button")).toHaveTextContent("can add: false");
  });
});

function PollConsumer() {
  const { title, columns, offline, updateColumnTitle } = useBoard();
  return (
    <div>
      <button onClick={() => updateColumnTitle("c1", "Renamed")}>rename</button>
      <output data-testid="title">{title}</output>
      <output data-testid="col">{columns[0].title}</output>
      <output data-testid="offline">{String(offline)}</output>
    </div>
  );
}

// Every server snapshot carries a version; a snapshot older than what is on
// screen must never replace it, and an unchanged board costs a 204.
describe("BoardContext version-gated polling", () => {
  const snap = (version: number | undefined, title = "Test board", col = "Col 1"): BoardDTO => ({
    ...baseLoaderData([]),
    title,
    version,
    columns: [{ id: "c1", title: col, prompt: "", col_order: 0, notes: [] }],
  });
  const ok = (body: BoardDTO) => ({ ok: true, status: 200, json: async () => body });
  const noChange = () => ({ ok: true, status: 204, json: vi.fn() });
  const urls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(([u]) => u);
  const tick = (ms = POLL_INTERVAL_MS) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const text = (id: string) => screen.getByTestId(id).textContent;
  const tree = () => <BoardProvider><PollConsumer /></BoardProvider>;

  let fetchMock: ReturnType<typeof vi.fn>;
  const setVisibility = (state: string) =>
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });

  beforeEach(() => {
    vi.useFakeTimers();
    nextFetcher = 0;
    fetcherData.clear();
    fetcherState.clear();
    mockLoaderData.mockReturnValue(snap(5));
    fetchMock = vi.fn(() => Promise.resolve(noChange()));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (document as unknown as Record<string, unknown>).visibilityState;
  });

  it("polls every second, sending the version it has", async () => {
    render(tree());
    await tick(POLL_INTERVAL_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();

    await tick(1);
    expect(urls(fetchMock)).toEqual(["/app/board/board-1/poll?v=5"]);
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("changes nothing on a 204, and clears offline without reading a body", async () => {
    const res = noChange();
    fetchMock.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(res);
    render(tree());
    await tick();
    expect(text("offline")).toBe("true");

    await tick();
    expect(text("offline")).toBe("false");
    expect(res.json).not.toHaveBeenCalled();
    expect(text("title")).toBe("Test board");
  });

  it("applies a newer snapshot and sends its version on the next poll", async () => {
    fetchMock.mockResolvedValueOnce(ok(snap(7, "Seven", "Col seven")));
    render(tree());
    await tick();
    expect(text("title")).toBe("Seven");
    expect(text("col")).toBe("Col seven");

    await tick();
    expect(urls(fetchMock)[1]).toBe("/app/board/board-1/poll?v=7");
  });

  it("drops a poll older than what is applied, and never moves the version back", async () => {
    fetchMock.mockResolvedValueOnce(ok(snap(7, "Seven"))).mockResolvedValueOnce(ok(snap(6, "Six")));
    render(tree());
    await tick();
    await tick();
    expect(text("title")).toBe("Seven");

    await tick();
    expect(urls(fetchMock)[2]).toBe("/app/board/board-1/poll?v=7");
  });

  it("drops a poll that predates a save response which landed first", async () => {
    let answerPoll = (_r: unknown) => {};
    let answerSave = (_r: unknown) => {};
    fetchMock.mockImplementation((url: string) =>
      new Promise((resolve) => { if (url.includes("/poll")) answerPoll = resolve; else answerSave = resolve; })
    );
    render(tree());
    await tick();
    fireEvent.click(screen.getByText("rename"));

    await act(async () => answerSave(ok(snap(9, "Test board", "Saved"))));
    expect(text("col")).toBe("Saved");
    await act(async () => answerPoll(ok(snap(8, "Test board", "Old"))));

    expect(text("col")).toBe("Saved");
  });

  it("drops a save response older than what is applied", async () => {
    let answerSave = (_r: unknown) => {};
    fetchMock.mockImplementation((url: string) =>
      url.includes("/poll")
        ? Promise.resolve(ok(snap(7, "Test board", "Seven")))
        : new Promise((resolve) => { answerSave = resolve; })
    );
    render(tree());
    await tick();
    expect(text("col")).toBe("Seven");

    fireEvent.click(screen.getByText("rename"));
    await act(async () => answerSave(ok(snap(6, "Test board", "Server six"))));

    expect(text("col")).toBe("Renamed");
  });

  it("drops a settings response older than what is applied", async () => {
    fetchMock.mockResolvedValueOnce(ok(snap(7, "Seven", "Seven")));
    const { rerender } = render(tree());
    await tick();

    fetcherData.set(SETTINGS_FETCHER, snap(6, "Six", "Stale"));
    rerender(tree());

    expect(text("col")).toBe("Seven");
  });

  it("ignores loader data older than what is applied", async () => {
    fetchMock.mockResolvedValueOnce(ok(snap(7, "Seven")));
    const { rerender } = render(tree());
    await tick();

    mockLoaderData.mockReturnValue(snap(6, "Stale loader"));
    rerender(tree());

    expect(text("title")).toBe("Seven");
  });

  it("applies loader data that is not older", () => {
    const { rerender } = render(tree());
    mockLoaderData.mockReturnValue(snap(6, "Fresh loader"));
    rerender(tree());
    expect(text("title")).toBe("Fresh loader");
  });

  it("does not apply a poll while a save is pending", async () => {
    let answerSave = (_r: unknown) => {};
    fetchMock.mockImplementation((url: string) =>
      url.includes("/poll")
        ? Promise.resolve(ok(snap(6, "Test board", "Polled")))
        : new Promise((resolve) => { answerSave = resolve; })
    );
    render(tree());
    fireEvent.click(screen.getByText("rename"));
    await tick();

    expect(text("col")).toBe("Renamed");
    // Dropped for now, not consumed: the version it carried is still wanted.
    await act(async () => answerSave({ ok: false }));
    await tick();
    expect(text("col")).toBe("Polled");
    expect(urls(fetchMock).filter((u: string) => u.includes("/poll"))[0]).toBe("/app/board/board-1/poll?v=5");
  });

  it("does not apply a poll while a fetcher is not idle", async () => {
    fetchMock.mockResolvedValue(ok(snap(6, "Test board", "Polled")));
    fetcherState.set(NOTE_FETCHER, "submitting");
    const { rerender } = render(tree());
    await tick();
    expect(text("col")).toBe("Col 1");

    fetcherState.set(NOTE_FETCHER, "idle");
    rerender(tree());
    await tick();
    expect(text("col")).toBe("Polled");
  });

  it("does not poll while the tab is hidden, and polls at once when it is shown", async () => {
    setVisibility("hidden");
    render(tree());
    await tick(3 * POLL_INTERVAL_MS);
    expect(fetchMock).not.toHaveBeenCalled();

    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops listening for visibility changes when it unmounts", async () => {
    const { unmount } = render(tree());
    unmount();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for a full snapshot once FULL_REFRESH_MS has passed without one", async () => {
    render(tree());
    for (let i = 0; i < FULL_REFRESH_MS / POLL_INTERVAL_MS; i++) await tick();

    const sent = urls(fetchMock);
    expect(sent).toHaveLength(FULL_REFRESH_MS / POLL_INTERVAL_MS);
    expect(sent.slice(0, -1).every((u: string) => u.endsWith("?v=5"))).toBe(true);
    expect(sent.at(-1)).toBe("/app/board/board-1/poll");
  });

  it("applies a snapshot that has no version, such as an example board", async () => {
    mockLoaderData.mockReturnValue(snap(undefined));
    fetchMock.mockResolvedValue(ok(snap(undefined, "Legacy")));
    render(tree());
    await tick();

    expect(urls(fetchMock)[0]).toBe("/app/board/board-1/poll");
    expect(text("title")).toBe("Legacy");
  });
});
