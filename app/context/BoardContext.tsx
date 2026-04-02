// context/BoardContext.tsx
// Each mutation submits to its own resource route.
// No more string-dispatch bus. No more JSON.stringify(payload).

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { nanoid } from "nanoid";
import type { Attachment, Board, BoardDTO, Column, Note } from "~/server/board.types";

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

function syncTimerState(
  data: { timerRunning: boolean; timerEndsAt: string | null },
  currentRunning: boolean,
  currentEndsAt: string | null,
  setTimerRunning: (v: boolean) => void,
  setTimerEndsAt: (v: string | null) => void
) {
  if (data.timerRunning && !currentRunning) {
    setTimerRunning(true);
    setTimerEndsAt(data.timerEndsAt);
  } else if (!data.timerRunning && currentRunning) {
    setTimerRunning(false);
    setTimerEndsAt(null);
  } else if (data.timerRunning && currentRunning && data.timerEndsAt !== currentEndsAt) {
    setTimerEndsAt(data.timerEndsAt);
  }
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
  const settingsFetcher = useFetcher();

  const [columns, setColumns] = useState<Column[]>(loaderData.columns);
  const [timerRunning, setTimerRunning] = useState(loaderData.timerRunning);
  const [timerEndsAt, setTimerEndsAt] = useState<string | null>(loaderData.timerEndsAt);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const [votingEnabled, setVotingEnabled] = useState(loaderData.votingEnabled ?? false);
  const [votingAllowed, setVotingAllowed] = useState(loaderData.votingAllowed ?? 5);
  const [notesLocked, setNotesLocked] = useState(loaderData.notesLocked ?? false);
  const [boardLocked, setBoardLocked] = useState(loaderData.boardLocked ?? false);
  const [attachments, setAttachments] = useState<Attachment[]>(loaderData.attachments ?? []);
  const attachmentFetcher = useFetcher();
  const isOwner = loaderData.isOwner ?? false;

  // ---------------------------------------------------------------------------
  // Sync server → local when loader revalidates
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setColumns((prev) => mergeColumns(loaderData.columns as Column[], prev));
  }, [loaderData.columns]);

  useEffect(() => {
    setTitle(loaderData.title);
  }, [loaderData.title]);

  useEffect(() => {
    setVotingEnabled(loaderData.votingEnabled ?? false);
    setVotingAllowed(loaderData.votingAllowed ?? 5);
    setNotesLocked(loaderData.notesLocked ?? false);
    setBoardLocked(loaderData.boardLocked ?? false);
  }, [loaderData.votingEnabled, loaderData.votingAllowed, loaderData.notesLocked, loaderData.boardLocked]);

  // Sync timer from server (other users may have started/stopped it).
  // timerEndsAt is always a UTC ISO string (forced by the SQL query), so
  // new Date(timerEndsAt) is unambiguous — no timezone offset accumulation.
  useEffect(() => {
    syncTimerState(loaderData, timerRunning, timerEndsAt, setTimerRunning, setTimerEndsAt);
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

  useEffect(() => {
    if (attachmentFetcher.data) {
      setAttachments(attachmentFetcher.data as Attachment[]);
    }
  }, [attachmentFetcher.data]);

  useEffect(() => {
    if (settingsFetcher.data) {
      const data = settingsFetcher.data as BoardDTO;
      setColumns(data.columns as Column[]);
      setVotingEnabled(data.votingEnabled ?? false);
      setVotingAllowed(data.votingAllowed ?? 5);
      setNotesLocked(data.notesLocked ?? false);
      setBoardLocked(data.boardLocked ?? false);
    }
  }, [settingsFetcher.data]);

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
        setVotingEnabled(data.votingEnabled ?? false);
        setVotingAllowed(data.votingAllowed ?? 5);
        setNotesLocked(data.notesLocked ?? false);
        setBoardLocked(data.boardLocked ?? false);
        if (data.attachments) setAttachments(data.attachments);

        syncTimerState(data, timerRunning, timerEndsAt, setTimerRunning, setTimerEndsAt);
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
    if (isReadOnly || boardLocked) return;
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
    if (isReadOnly || notesLocked || boardLocked) return;
    if (columns.length >= 12) {
      alert("You have reached the maximum of 12 columns.");
      return;
    }

    const nextOrder = deriveNextColOrder(columns);
    const newCol: Column = {
      id: nanoid(),
      title: `Column ${nextOrder}`,
      prompt: "",
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
    if (isReadOnly || notesLocked || boardLocked) return;
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)));
    columnFetcher.submit(
      { columnId: id, title: newTitle },
      { method: "PATCH", action: `/app/board/${boardId}/columns` }
    );
  };

  const updateColumnPrompt = (id: string, prompt: string) => {
    if (isReadOnly || notesLocked || boardLocked) return;
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, prompt } : c)));
    columnFetcher.submit(
      { intent: "updatePrompt", columnId: id, prompt },
      { method: "PATCH", action: `/app/board/${boardId}/columns` }
    );
  };

  const deleteColumn = (id: string) => {
    if (isReadOnly || notesLocked || boardLocked) return;
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
    if (isReadOnly || notesLocked || boardLocked) return;
    const col = columns.find((c) => c.id === columnId);
    const newNote: Note = {
      id: nanoid(),
      text: "",
      likes: 0,
      is_new: true,
      column_id: columnId,
      created: Date.now().toString(),
      note_order: col ? col.notes.length : 0,
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
    if (isReadOnly || notesLocked || boardLocked) return;
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
    if (isReadOnly || boardLocked) return;
    noteFetcher.submit(
      { intent: "like", noteId, delta },
      { method: "PATCH", action: `/app/board/${boardId}/notes` }
    );
  };

  const deleteNote = (columnId: string, noteId: string, text?: string) => {
    if (isReadOnly || notesLocked || boardLocked) return;
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
    if (isReadOnly || notesLocked || boardLocked || fromColumnId === toColumnId) return;

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

  // Move a note between columns in local state only (no server call).
  // Used during drag to show the placeholder in the target column.
  const moveNoteLocally = (fromColumnId: string, toColumnId: string, noteId: string, newIndex: number) => {
    if (isReadOnly || notesLocked || boardLocked) return;

    setColumns((prev) => {
      const sourceCol = prev.find((c) => c.id === fromColumnId);
      const movedNote = sourceCol?.notes.find((n) => n.id === noteId);
      if (!movedNote) return prev;

      // Remove from source
      const withRemoved = prev.map((c) => {
        if (c.id !== fromColumnId) return c;
        return { ...c, notes: c.notes.filter((n) => n.id !== noteId) };
      });

      // Insert into target
      return withRemoved.map((c) => {
        if (c.id !== toColumnId) return c;
        const notes = [...c.notes];
        notes.splice(newIndex, 0, movedNote);
        return { ...c, notes: notes.map((n, i) => ({ ...n, note_order: i })) };
      });
    });
  };

  const reorderNote = (fromColumnId: string, toColumnId: string, noteId: string, newIndex: number) => {
    if (isReadOnly || notesLocked || boardLocked) return;

    let movedNote: Note | undefined;
    let orderedNoteIds: string[] | undefined;

    setColumns((prev) => {
      // Remove note from source column
      const withRemoved = prev.map((c) => {
        if (c.id !== fromColumnId) return c;
        movedNote = c.notes.find((n) => n.id === noteId);
        return { ...c, notes: c.notes.filter((n) => n.id !== noteId) };
      });

      if (!movedNote) return prev;

      // Insert note at newIndex in target column
      return withRemoved.map((c) => {
        if (c.id !== toColumnId) return c;
        const notes = [...c.notes];
        notes.splice(newIndex, 0, movedNote!);
        const reordered = notes.map((n, i) => ({ ...n, note_order: i }));
        orderedNoteIds = reordered.map((n) => n.id);
        return { ...c, notes: reordered };
      });
    });

    if (orderedNoteIds) {
      noteFetcher.submit(
        {
          intent: "reorder",
          toColumnId,
          orderedNoteIds: JSON.stringify(orderedNoteIds),
        },
        { method: "PATCH", action: `/app/board/${boardId}/notes` }
      );
    }
  };

  const voteNote = (noteId: string) => {
    if (isReadOnly || boardLocked) return;
    noteFetcher.submit(
      { intent: "vote", noteId },
      { method: "PATCH", action: `/app/board/${boardId}/notes` }
    );
  };

  const updateBoardSettings = (settings: { votingEnabled: boolean; votingAllowed: number; notesLocked: boolean; boardLocked: boolean }) => {
    if (isReadOnly) return;
    setVotingEnabled(settings.votingEnabled);
    setVotingAllowed(settings.votingAllowed);
    setNotesLocked(settings.notesLocked);
    setBoardLocked(settings.boardLocked);
    settingsFetcher.submit(
      {
        votingEnabled: String(settings.votingEnabled),
        votingAllowed: settings.votingAllowed,
        notesLocked: String(settings.notesLocked),
        boardLocked: String(settings.boardLocked),
      },
      { method: "PATCH", action: `/app/board/${boardId}/settings` }
    );
  };

  // ---------------------------------------------------------------------------
  // Attachment actions
  // ---------------------------------------------------------------------------

  const addLinkAttachment = (filename: string, link: string) => {
    if (isReadOnly) return;
    attachmentFetcher.submit(
      { type: "link", filename, link },
      { method: "POST", action: `/app/board/${boardId}/attachments` }
    );
  };

  const addImageAttachment = (filename: string, imageData: string) => {
    if (isReadOnly) return;
    attachmentFetcher.submit(
      { type: "image", filename, imageData },
      { method: "POST", action: `/app/board/${boardId}/attachments` }
    );
  };

  const deleteAttachment = (attachmentId: string) => {
    if (isReadOnly) return;
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    attachmentFetcher.submit(
      { attachmentId },
      { method: "DELETE", action: `/app/board/${boardId}/attachments` }
    );
  };

  // ---------------------------------------------------------------------------
  // Timer actions
  // ---------------------------------------------------------------------------

  const startTimer = (seconds: number) => {
    if (isReadOnly || boardLocked || timerRunning || timerFetcher.state !== "idle") return;

    const endsAt = new Date(Date.now() + seconds * 1000).toISOString();
    setTimerRunning(true);
    setTimerEndsAt(endsAt);

    timerFetcher.submit(
      { seconds },
      { method: "POST", action: `/app/board/${boardId}/timer` }
    );
  };

  const stopTimer = () => {
    if (isReadOnly || boardLocked || !timerRunning || timerFetcher.state !== "idle") return;

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
    isOwner,
    columns,
    nextColOrder: deriveNextColOrder(columns),
    offline,
    timerRunning,
    timerEndsAt,
    timeLeft,
    votingEnabled,
    votingAllowed,
    notesLocked,
    boardLocked,
    addColumn,
    updateColumnTitle,
    updateColumnPrompt,
    deleteColumn,
    addNote,
    updateNote,
    likeNote,
    voteNote,
    updateBoardSettings,
    deleteNote,
    moveNote,
    reorderNote,
    moveNoteLocally,
    attachments,
    addLinkAttachment,
    addImageAttachment,
    deleteAttachment,
    startTimer,
    stopTimer,
  };

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}