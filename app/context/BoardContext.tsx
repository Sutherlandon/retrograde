// context/BoardContext.tsx
// Each mutation submits to its own resource route.
// No more string-dispatch bus. No more JSON.stringify(payload).

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { nanoid } from "nanoid";
import type { Board, BoardDTO, Column, Note } from "~/server/board.types";

// ---------------------------------------------------------------------------
// Context setup
// ---------------------------------------------------------------------------

const BoardContext = createContext<Board | null>(null);

export function useBoard(): Board {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside <BoardProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveNextColOrder(columns: Column[]): number {
  if (columns.length === 0) return 1;
  return Math.max(...columns.map((c) => c.col_order)) + 1;
}

/**
 * Merge server columns into local state.
 * Preserves unsaved in-flight notes (is_new) and locally-edited text.
 */
function mergeColumns(serverCols: Column[], prevCols: Column[]): Column[] {
  return serverCols.map((serverCol) => {
    const localCol = prevCols.find((c) => c.id === serverCol.id);
    if (!localCol) return serverCol;

    const notes = serverCol.notes.map((serverNote) => {
      const localNote = localCol.notes.find((n) => n.id === serverNote.id);
      if (!localNote) return serverNote;
      // Preserve locally-edited text if the note is still "new" (unsaved)
      return localNote.is_new
        ? { ...serverNote, text: localNote.text }
        : serverNote;
    });

    // Keep any is_new notes that haven't hit the server yet
    const inFlight = localCol.notes.filter(
      (n) => n.is_new && !serverCol.notes.find((sn) => sn.id === n.id)
    );

    return { ...serverCol, notes: [...notes, ...inFlight] };
  });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const loaderData = useLoaderData() as BoardDTO;

  const boardId = loaderData.id;
  const isReadOnly = loaderData.readonly;

  const [title, setTitle] = useState(loaderData.title);

  // Separate fetchers per concern — each gets its own pending/error state
  const columnFetcher = useFetcher();
  const noteFetcher = useFetcher();
  const timerFetcher = useFetcher();

  const [columns, setColumns] = useState<Column[]>(loaderData.columns);
  const [timerRunning, setTimerRunning] = useState(loaderData.timerRunning);
  const [timerEndsAt, setTimerEndsAt] = useState<string | null>(loaderData.timerEndsAt);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  // ---------------------------------------------------------------------------
  // Sync server → local when loader revalidates
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setColumns((prev) => mergeColumns(loaderData.columns as Column[], prev));
  }, [loaderData.columns]);

  useEffect(() => {
    setTitle(loaderData.title);
  }, [loaderData.title]);

  // Sync timer from server (other users may have started/stopped it).
  // timerEndsAt is always a UTC ISO string (forced by the SQL query), so
  // new Date(timerEndsAt) is unambiguous — no timezone offset accumulation.
  useEffect(() => {
    if (loaderData.timerRunning && !timerRunning) {
      setTimerRunning(true);
      setTimerEndsAt(loaderData.timerEndsAt);
    } else if (!loaderData.timerRunning && timerRunning) {
      setTimerRunning(false);
      setTimerEndsAt(null);
    } else if (loaderData.timerRunning && timerRunning && loaderData.timerEndsAt !== timerEndsAt) {
      setTimerEndsAt(loaderData.timerEndsAt);
    }
  }, [loaderData.timerRunning, loaderData.timerEndsAt]);

  // ---------------------------------------------------------------------------
  // Sync resource route responses → local (optimistic confirmation)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (columnFetcher.data) setColumns((columnFetcher.data as BoardDTO).columns as Column[]);
  }, [columnFetcher.data]);

  useEffect(() => {
    if (noteFetcher.data) setColumns((noteFetcher.data as BoardDTO).columns as Column[]);
  }, [noteFetcher.data]);

  // ---------------------------------------------------------------------------
  // Polling for multi-user sync — plain fetch() bypasses RR7's turbostream
  // pipeline entirely, so network errors never reach the ErrorBoundary.
  // ---------------------------------------------------------------------------

  const isFetching = useRef(false);

  useEffect(() => {
    if (isReadOnly) return;

    const interval = setInterval(async () => {
      if (isFetching.current) return;
      isFetching.current = true;

      try {
        const res = await fetch(`/app/board/${boardId}/poll`, {
          headers: { Accept: "application/json" },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: BoardDTO = await res.json();
        setOffline(false);
        setColumns((prev) => mergeColumns(data.columns as Column[], prev));
        setTitle(data.title);

        if (data.timerRunning && !timerRunning) {
          setTimerRunning(true);
          setTimerEndsAt(data.timerEndsAt);
        } else if (!data.timerRunning && timerRunning) {
          setTimerRunning(false);
          setTimerEndsAt(null);
        } else if (data.timerRunning && timerRunning && data.timerEndsAt !== timerEndsAt) {
          setTimerEndsAt(data.timerEndsAt);
        }
      } catch (err) {
        console.error("[poll] failed:", err);
        setOffline(true);
      } finally {
        isFetching.current = false;
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [boardId, isReadOnly, timerRunning, timerEndsAt]);

  // ---------------------------------------------------------------------------
  // Timer countdown
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!timerRunning || !timerEndsAt) {
      setTimeLeft(null);
      return;
    }

    const tick = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(timerEndsAt).getTime() - Date.now()) / 1000)
      );
      setTimeLeft(diff);
      if (diff === 0) setTimerRunning(false);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerEndsAt]);

  // ---------------------------------------------------------------------------
  // Board actions
  // ---------------------------------------------------------------------------

  const updateTitle = (newTitle: string) => {
    if (isReadOnly) return;
    setTitle(newTitle);
    columnFetcher.submit(
      { title: newTitle },
      { method: "PATCH", action: `/app/board/${boardId}/title` }
    );
  };

  // ---------------------------------------------------------------------------
  // Column actions
  // ---------------------------------------------------------------------------

  const addColumn = () => {
    if (isReadOnly) return;
    if (columns.length >= 12) {
      confirm("You have reached the maximum of 12 columns.");
      return;
    }

    const nextOrder = deriveNextColOrder(columns);
    const newCol: Column = {
      id: nanoid(),
      title: `Column ${nextOrder}`,
      col_order: nextOrder,
      notes: [],
    };

    setColumns((prev) => [...prev, newCol].sort((a, b) => a.col_order - b.col_order));

    columnFetcher.submit(
      { id: newCol.id, title: newCol.title, col_order: newCol.col_order },
      { method: "POST", action: `/app/board/${boardId}/columns` }
    );
  };

  const updateColumnTitle = (id: string, newTitle: string) => {
    if (isReadOnly) return;
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)));
    columnFetcher.submit(
      { columnId: id, title: newTitle },
      { method: "PATCH", action: `/app/board/${boardId}/columns` }
    );
  };

  const deleteColumn = (id: string) => {
    if (isReadOnly) return;
    setColumns((prev) => prev.filter((c) => c.id !== id));
    columnFetcher.submit(
      { columnId: id },
      { method: "DELETE", action: `/app/board/${boardId}/columns` }
    );
  };

  // ---------------------------------------------------------------------------
  // Note actions
  // ---------------------------------------------------------------------------

  const addNote = (columnId: string) => {
    if (isReadOnly) return;
    const newNote: Note = {
      id: nanoid(),
      text: "",
      likes: 0,
      is_new: true,
      column_id: columnId,
      created: Date.now().toString(),
    };
    // Local-only until the user saves content. updateNote upserts to the server,
    // so empty notes never appear on other clients.
    setColumns((prev) =>
      prev.map((c) => (c.id === columnId ? { ...c, notes: [...c.notes, newNote] } : c))
    );
  };

  const updateNote = (
    columnId: string,
    noteId: string,
    newText: string,
    likes: number,
    created: string
  ) => {
    if (isReadOnly) return;
    setColumns((prev) =>
      prev.map((c) =>
        c.id === columnId
          ? {
            ...c,
            notes: c.notes.map((n) =>
              n.id === noteId ? { ...n, text: newText, likes, is_new: false } : n
            ),
          }
          : c
      )
    );
    // Upsert — creates the row if it doesn't exist (first save), updates if it does.
    noteFetcher.submit(
      { noteId, columnId, text: newText, likes, created },
      { method: "PATCH", action: `/app/board/${boardId}/notes` }
    );
  };

  const likeNote = (noteId: string, delta: number) => {
    if (isReadOnly) return;
    noteFetcher.submit(
      { intent: "like", noteId, delta },
      { method: "PATCH", action: `/app/board/${boardId}/notes` }
    );
  };

  const deleteNote = (columnId: string, noteId: string, text?: string) => {
    if (isReadOnly) return;
    setColumns((prev) =>
      prev.map((c) =>
        c.id === columnId ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) } : c
      )
    );
    // Only hit the server if the note was ever saved (has text).
    // Empty is_new notes are local-only and have no DB row to delete.
    if (text) {
      noteFetcher.submit(
        { noteId, columnId },
        { method: "DELETE", action: `/app/board/${boardId}/notes` }
      );
    }
  };

  const moveNote = (fromColumnId: string, toColumnId: string, noteId: string) => {
    if (isReadOnly || fromColumnId === toColumnId) return;

    let movedNote: Note | undefined;

    setColumns((prev) => {
      const withRemoved = prev.map((c) => {
        if (c.id !== fromColumnId) return c;
        movedNote = c.notes.find((n) => n.id === noteId);
        return { ...c, notes: c.notes.filter((n) => n.id !== noteId) };
      });

      if (!movedNote) return prev;
      return withRemoved.map((c) =>
        c.id === toColumnId ? { ...c, notes: [...c.notes, movedNote!] } : c
      );
    });

    noteFetcher.submit(
      { intent: "move", noteId, fromColumnId, toColumnId },
      { method: "PATCH", action: `/app/board/${boardId}/notes` }
    );
  };

  // ---------------------------------------------------------------------------
  // Timer actions
  // ---------------------------------------------------------------------------

  const startTimer = (seconds: number) => {
    if (isReadOnly || timerRunning || timerFetcher.state !== "idle") return;

    const endsAt = new Date(Date.now() + seconds * 1000).toISOString();
    setTimerRunning(true);
    setTimerEndsAt(endsAt);

    timerFetcher.submit(
      { seconds },
      { method: "POST", action: `/app/board/${boardId}/timer` }
    );
  };

  const stopTimer = () => {
    if (isReadOnly || !timerRunning || timerFetcher.state !== "idle") return;

    setTimerRunning(false);
    setTimerEndsAt(null);

    timerFetcher.submit(
      {},
      { method: "DELETE", action: `/app/board/${boardId}/timer` }
    );
  };

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const value: Board = {
    id: boardId,
    title,
    updateTitle,
    readonly: isReadOnly,
    columns,
    nextColOrder: deriveNextColOrder(columns),
    offline,
    timerRunning,
    timerEndsAt,
    timeLeft,
    addColumn,
    updateColumnTitle,
    deleteColumn,
    addNote,
    updateNote,
    likeNote,
    deleteNote,
    moveNote,
    startTimer,
    stopTimer,
  };

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}