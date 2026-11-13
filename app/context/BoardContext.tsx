// context/BoardContext.tsx
// Each mutation submits to its own resource route.
// No more string-dispatch bus. No more JSON.stringify(payload).

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { nanoid } from "nanoid";
import type { ActionItem, Attachment, Board, BoardDTO, Column, Note } from "~/server/board.types";

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
// Version gate and polling
// ---------------------------------------------------------------------------

export const POLL_INTERVAL_MS = 1000;
// An unchanged poll answers 204 and carries nothing, so every so often the poll
// asks for the whole board anyway: that bounds how stale the inputs the server
// does not version (crew name, author names) can get.
export const FULL_REFRESH_MS = 30_000;

/**
 * Decides whether a server snapshot may touch state. One that is older than
 * what was already applied is dropped; anything else is applied and moves the
 * high-water mark. A snapshot without a version (the static example boards)
 * always applies, as before. Equal versions apply: a forced full refresh may
 * carry changes the version does not track.
 */
function admitSnapshot(versionRef: { current: number | null }, snapshot: { version?: number }): boolean {
  const v = snapshot.version;
  if (typeof v !== "number") return true;
  if (versionRef.current !== null && v < versionRef.current) return false;
  versionRef.current = v;
  return true;
}

type PollInputs = {
  boardId: string;
  isReadOnly: boolean;
  versionRef: { current: number | null };
  pendingSaves: { current: number };
  // Refreshed every render so the interval callback sees current values.
  latest: { current: { apply: (data: BoardDTO) => void; fetchersIdle: boolean } };
  setOffline: (v: boolean) => void;
};

/**
 * Polls for other people's changes. Plain fetch() bypasses RR7's turbostream
 * pipeline entirely, so network errors never reach the ErrorBoundary.
 */
function useBoardPoll({ boardId, isReadOnly, versionRef, pendingSaves, latest, setOffline }: PollInputs) {
  const isFetching = useRef(false);

  useEffect(() => {
    if (isReadOnly) return;
    // The page load was a full snapshot.
    let lastFull = Date.now();

    const poll = async () => {
      if (isFetching.current || document.visibilityState === "hidden") return;
      isFetching.current = true;
      try {
        const v = versionRef.current;
        const wantFull = v === null || Date.now() - lastFull >= FULL_REFRESH_MS;
        const url = wantFull ? `/app/board/${boardId}/poll` : `/app/board/${boardId}/poll?v=${v}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });

        if (res.status === 204) {
          setOffline(false);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: BoardDTO = await res.json();
        setOffline(false);
        // Optimistic state from a save or fetcher is not on the server yet, so a
        // snapshot taken now would take it off the screen until the next one.
        if (pendingSaves.current > 0 || !latest.current.fetchersIdle) return;
        if (!admitSnapshot(versionRef, data)) return;
        latest.current.apply(data);
        // Only an applied snapshot counts: one set aside above may have been the
        // full refresh, and its unversioned changes are still owed.
        lastFull = Date.now();
      } catch (err) {
        console.error("[poll] failed:", err);
        setOffline(true);
      } finally {
        isFetching.current = false;
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    // A hidden tab does not poll, so catch up the moment it is looked at again.
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [boardId, isReadOnly]);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const loaderData = useLoaderData() as BoardDTO;

  const boardId = loaderData.id;
  const isReadOnly = loaderData.readonly;

  // Highest snapshot version applied; every server snapshot goes through
  // admit() before it touches state.
  const versionRef = useRef<number | null>(loaderData.version ?? null);
  const versionBoardId = useRef(boardId);
  if (versionBoardId.current !== boardId) {
    versionBoardId.current = boardId;
    versionRef.current = loaderData.version ?? null;
  }
  const admit = (snapshot: BoardDTO) => admitSnapshot(versionRef, snapshot);

  const [title, setTitle] = useState(loaderData.title);
  const teamName = (loaderData.team_name as string | null | undefined) ?? null;

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
  const [votingScope, setVotingScope] = useState<"board" | "column" | "note">(loaderData.votingScope ?? "board");
  const [notesLocked, setNotesLocked] = useState(loaderData.notesLocked ?? false);
  const [boardLocked, setBoardLocked] = useState(loaderData.boardLocked ?? false);
  const [attributionEnabled, setAttributionEnabled] = useState(loaderData.attributionEnabled ?? false);
  const [actionItemsVisible, setActionItemsVisible] = useState(loaderData.actionItemsVisible ?? true);
  const [hideOthersNotes, setHideOthersNotes] = useState(loaderData.hideOthersNotes ?? false);
  const [canFacilitate, setCanFacilitate] = useState(loaderData.canFacilitate ?? loaderData.isOwner ?? false);
  const [openFacilitation, setOpenFacilitation] = useState(loaderData.openFacilitation ?? false);
  const [actionItems, setActionItems] = useState<ActionItem[]>((loaderData.actionItems as ActionItem[]) ?? []);
  // Lives here because a note's Shift+Tab opens it, as well as the panel's "+".
  const [addingActionItem, setAddingActionItem] = useState(false);
  const [boardLockedAt, setBoardLockedAt] = useState<Date | null>(
    loaderData.boardLocked ? new Date() : null
  );

  const setLocked = (locked: boolean) => {
    setBoardLocked(locked);
    if (locked) setBoardLockedAt((prev) => prev ?? new Date());
    else setBoardLockedAt(null);
  };

  const [voterCount, setVoterCount] = useState(loaderData.voterCount ?? 0);
  const [contributorCount, setContributorCount] = useState(loaderData.contributorCount ?? 0);
  const [attachments, setAttachments] = useState<Attachment[]>(loaderData.attachments ?? []);
  const attachmentFetcher = useFetcher();
  const actionItemFetcher = useFetcher();
  const isOwner = loaderData.isOwner ?? false;
  // BRD-020: default TRUE (not false) — an older/incomplete loader response
  // should never spuriously offer to claim a board that already has an owner.
  const hasOwner = loaderData.hasOwner ?? true;
  // Guest-board notices. Default to "the creator" and "never archived" so an
  // incomplete loader response shows neither the invite nor a false deadline.
  const isCreator = loaderData.isCreator ?? true;
  const archivesAt = loaderData.archivesAt ?? null;

  // ---------------------------------------------------------------------------
  // Sync server → local when loader revalidates
  // ---------------------------------------------------------------------------

  // A loader result older than what a poll or save already applied updates nothing.
  useEffect(() => {
    if (admit(loaderData)) setColumns((prev) => mergeColumns(loaderData.columns as Column[], prev));
  }, [loaderData.columns]);

  useEffect(() => {
    if (admit(loaderData)) setTitle(loaderData.title);
  }, [loaderData.title]);

  useEffect(() => {
    if (!admit(loaderData)) return;
    setVotingEnabled(loaderData.votingEnabled ?? false);
    setVotingAllowed(loaderData.votingAllowed ?? 5);
    setVotingScope(loaderData.votingScope ?? "board");
    setNotesLocked(loaderData.notesLocked ?? false);
    setLocked(loaderData.boardLocked ?? false);
    setAttributionEnabled(loaderData.attributionEnabled ?? false);
    setActionItemsVisible(loaderData.actionItemsVisible ?? true);
    setHideOthersNotes(loaderData.hideOthersNotes ?? false);
  }, [loaderData.votingEnabled, loaderData.votingAllowed, loaderData.votingScope, loaderData.notesLocked, loaderData.boardLocked, loaderData.attributionEnabled, loaderData.actionItemsVisible, loaderData.hideOthersNotes]);

  useEffect(() => {
    if (!admit(loaderData)) return;
    setActionItems((loaderData.actionItems as ActionItem[]) ?? []);
    setCanFacilitate(loaderData.canFacilitate ?? loaderData.isOwner ?? false);
    setOpenFacilitation(loaderData.openFacilitation ?? false);
  }, [loaderData.actionItems, loaderData.canFacilitate, loaderData.openFacilitation, loaderData.isOwner]);

  // Sync timer from server (other users may have started/stopped it).
  // timerEndsAt is always a UTC ISO string (forced by the SQL query), so
  // new Date(timerEndsAt) is unambiguous — no timezone offset accumulation.
  useEffect(() => {
    if (!admit(loaderData)) return;
    syncTimerState(loaderData, timerRunning, timerEndsAt, setTimerRunning, setTimerEndsAt);
  }, [loaderData.timerRunning, loaderData.timerEndsAt]);

  // ---------------------------------------------------------------------------
  // Sync resource route responses → local (optimistic confirmation)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (columnFetcher.data) {
      const data = columnFetcher.data as BoardDTO;
      if (!admit(data)) return;
      setColumns((prev) => mergeColumns(data.columns as Column[], prev));
    }
  }, [columnFetcher.data]);

  const applySaveResponse = (data: BoardDTO) => {
    if (!admit(data)) return;
    setColumns((prev) => mergeColumns(data.columns as Column[], prev));
    if (data.voterCount !== undefined) setVoterCount(data.voterCount);
    if (data.contributorCount !== undefined) setContributorCount(data.contributorCount);
    if (data.actionItems) setActionItems(data.actionItems as ActionItem[]);
  };

  useEffect(() => {
    if (noteFetcher.data) applySaveResponse(noteFetcher.data as BoardDTO);
  }, [noteFetcher.data]);

  // Note saves and deletes, column-title saves and action item text saves are
  // plain fetches: a fetcher cancels its in-flight request when it submits again,
  // and Tab saves one thing after another, so an earlier save could die before
  // reaching the server. Only
  // the last response of a burst is applied, because an earlier one predates the
  // later saves and would undo their optimistic state. A failed save is left for
  // the poll to reconcile. Pass `after` to hold a save until an earlier one lands;
  // it counts as pending from the moment it is asked for.
  const pendingSaves = useRef(0);

  const saveToServer = async (
    resource: "notes" | "columns" | "action-items",
    fields: Record<string, string>,
    method: "PATCH" | "POST" | "DELETE" = "PATCH",
    after?: Promise<void>
  ) => {
    pendingSaves.current += 1;
    if (after) await after;
    let data: BoardDTO | null = null;
    try {
      const res = await fetch(`/app/board/${boardId}/${resource}`, {
        method,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields),
      });
      if (res.ok) data = await res.json();
    } catch {
      // Offline: the poll reports it.
    }
    pendingSaves.current -= 1;
    if (data && pendingSaves.current === 0) applySaveResponse(data);
  };

  useEffect(() => {
    if (attachmentFetcher.data) {
      setAttachments(attachmentFetcher.data as Attachment[]);
    }
  }, [attachmentFetcher.data]);

  useEffect(() => {
    if (actionItemFetcher.data) {
      const data = actionItemFetcher.data as BoardDTO;
      if (!admit(data)) return;
      if (data.actionItems) setActionItems(data.actionItems as ActionItem[]);
    }
  }, [actionItemFetcher.data]);

  useEffect(() => {
    if (settingsFetcher.data) {
      const data = settingsFetcher.data as BoardDTO;
      if (!admit(data)) return;
      setColumns(data.columns as Column[]);
      setVotingEnabled(data.votingEnabled ?? false);
      setVotingAllowed(data.votingAllowed ?? 5);
      setNotesLocked(data.notesLocked ?? false);
      setLocked(data.boardLocked ?? false);
      setAttributionEnabled(data.attributionEnabled ?? false);
      setActionItemsVisible(data.actionItemsVisible ?? true);
      setHideOthersNotes(data.hideOthersNotes ?? false);
    }
  }, [settingsFetcher.data]);

  // ---------------------------------------------------------------------------
  // Polling for multi-user sync
  // ---------------------------------------------------------------------------

  const applyPollSnapshot = (data: BoardDTO) => {
    setColumns((prev) => mergeColumns(data.columns as Column[], prev));
    setTitle(data.title);
    setVotingEnabled(data.votingEnabled ?? false);
    setVotingAllowed(data.votingAllowed ?? 5);
    setNotesLocked(data.notesLocked ?? false);
    setLocked(data.boardLocked ?? false);
    setActionItemsVisible(data.actionItemsVisible ?? true);
    setHideOthersNotes(data.hideOthersNotes ?? false);
    if (data.voterCount !== undefined) setVoterCount(data.voterCount);
    if (data.contributorCount !== undefined) setContributorCount(data.contributorCount);
    if (data.attachments) setAttachments(data.attachments);
    setActionItems((data.actionItems as ActionItem[]) ?? []);
    setCanFacilitate(data.canFacilitate ?? false);
    setOpenFacilitation(data.openFacilitation ?? false);
    syncTimerState(data, timerRunning, timerEndsAt, setTimerRunning, setTimerEndsAt);
  };

  const fetchersIdle = [
    columnFetcher, noteFetcher, timerFetcher, settingsFetcher, attachmentFetcher, actionItemFetcher,
  ].every((f) => f.state === "idle");
  const pollLatest = useRef({ apply: applyPollSnapshot, fetchersIdle });
  pollLatest.current = { apply: applyPollSnapshot, fetchersIdle };

  useBoardPoll({ boardId, isReadOnly, versionRef, pendingSaves, latest: pollLatest, setOffline });

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
    saveToServer("columns", { columnId: id, title: newTitle });
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
    saveToServer("notes", { noteId, columnId, text: newText, likes: String(likes), created });
  };

  const likeNote = (noteId: string, delta: number) => {
    if (isReadOnly || boardLocked) return;
    noteFetcher.submit(
      { intent: "like", noteId, delta },
      { method: "PATCH", action: `/app/board/${boardId}/notes` }
    );
  };

  const deleteNote = (columnId: string, noteId: string) => {
    if (isReadOnly || notesLocked || boardLocked) return;
    const note = columns.find((c) => c.id === columnId)?.notes.find((n) => n.id === noteId);
    setColumns((prev) =>
      prev.map((c) =>
        c.id === columnId ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) } : c
      )
    );
    // is_new notes are local-only until first saved, so they have no DB row to delete.
    if (note && !note.is_new) saveToServer("notes", { noteId, columnId }, "DELETE");
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

  const sortNotesByScore = () => {
    if (isReadOnly) return;

    setColumns((prev) => {
      const sorted = prev.map((col) => {
        const notes = [...col.notes].sort((a, b) => {
          const scoreA = votingEnabled ? (a.votes ?? 0) : a.likes;
          const scoreB = votingEnabled ? (b.votes ?? 0) : b.likes;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return a.created < b.created ? -1 : a.created > b.created ? 1 : 0;
        });
        const reordered = notes.map((n, i) => ({ ...n, note_order: i }));

        // Fire server update for this column
        const orderedNoteIds = reordered.map((n) => n.id);
        fetch(`/app/board/${boardId}/notes`, {
          method: "PATCH",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            intent: "reorder",
            toColumnId: col.id,
            orderedNoteIds: JSON.stringify(orderedNoteIds),
          }),
        });

        return { ...col, notes: reordered };
      });
      return sorted;
    });
  };

  const voteNote = (noteId: string, delta: number) => {
    if (isReadOnly || boardLocked) return;
    // Optimistically update vote counts
    setColumns((prev) =>
      prev.map((c) => ({
        ...c,
        notes: c.notes.map((n) =>
          n.id === noteId
            ? { ...n, user_votes: (n.user_votes ?? 0) + delta, votes: (n.votes ?? 0) + delta }
            : n
        ),
      }))
    );
    noteFetcher.submit(
      { intent: "vote", noteId, delta: String(delta) },
      { method: "PATCH", action: `/app/board/${boardId}/notes` }
    );
  };

  const updateBoardSettings = (settings: { votingEnabled: boolean; votingAllowed: number; votingScope: "board" | "column" | "note"; notesLocked: boolean; boardLocked: boolean; attributionEnabled: boolean; actionItemsVisible: boolean; hideOthersNotes: boolean }) => {
    if (isReadOnly) return;
    setVotingEnabled(settings.votingEnabled);
    setVotingAllowed(settings.votingAllowed);
    setVotingScope(settings.votingScope);
    setNotesLocked(settings.notesLocked);
    setLocked(settings.boardLocked);
    setAttributionEnabled(settings.attributionEnabled);
    setActionItemsVisible(settings.actionItemsVisible);
    setHideOthersNotes(settings.hideOthersNotes);
    settingsFetcher.submit(
      {
        votingEnabled: String(settings.votingEnabled),
        votingAllowed: settings.votingAllowed,
        votingScope: settings.votingScope,
        notesLocked: String(settings.notesLocked),
        boardLocked: String(settings.boardLocked),
        attributionEnabled: String(settings.attributionEnabled),
        actionItemsVisible: String(settings.actionItemsVisible),
        hideOthersNotes: String(settings.hideOthersNotes),
      },
      { method: "PATCH", action: `/app/board/${boardId}/settings` }
    );
  };

  // ---------------------------------------------------------------------------
  // Action item actions (issue #88)
  // ---------------------------------------------------------------------------

  const canAddActionItems = canFacilitate && !boardLocked && actionItemsVisible;

  // Adds go one at a time because the server numbers an item when it arrives,
  // so overlapping adds from Tab could land out of order or share a number.
  const actionItemAdds = useRef<Promise<void>>(Promise.resolve());

  const addActionItem = (text: string) => {
    if (isReadOnly || boardLocked) return;
    // Shown under a local id until the save's response replaces the list.
    setActionItems((prev) => [
      ...prev,
      { id: nanoid(), text, completed: false, item_order: prev.length, created_at: new Date().toISOString(), is_new: true },
    ]);
    actionItemAdds.current = saveToServer("action-items", { text }, "POST", actionItemAdds.current);
  };

  const updateActionItem = (itemId: string, text: string) => {
    if (isReadOnly || boardLocked) return;
    setActionItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, text } : i)));
    saveToServer("action-items", { intent: "text", itemId, text });
  };

  const toggleActionItem = (itemId: string, completed: boolean) => {
    if (isReadOnly || boardLocked) return;
    setActionItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, completed } : i)));
    actionItemFetcher.submit(
      { intent: "complete", itemId, completed: String(completed) },
      { method: "PATCH", action: `/app/board/${boardId}/action-items` }
    );
  };

  const deleteActionItem = (itemId: string) => {
    if (isReadOnly || boardLocked) return;
    setActionItems((prev) => prev.filter((i) => i.id !== itemId));
    actionItemFetcher.submit(
      { itemId },
      { method: "DELETE", action: `/app/board/${boardId}/action-items` }
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
    teamName,
    updateTitle,
    readonly: isReadOnly,
    hasOwner,
    isOwner,
    isCreator,
    archivesAt,
    columns,
    nextColOrder: deriveNextColOrder(columns),
    offline,
    timerRunning,
    timerEndsAt,
    timeLeft,
    votingEnabled,
    votingAllowed,
    votingScope,
    notesLocked,
    boardLocked,
    boardLockedAt,
    voterCount,
    contributorCount,
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
    sortNotesByScore,
    clearParticipantCounts: () => { setVoterCount(0); },
    moveNoteLocally,
    attachments,
    addLinkAttachment,
    addImageAttachment,
    deleteAttachment,
    startTimer,
    stopTimer,
    attributionEnabled,
    actionItemsVisible,
    hideOthersNotes,
    canFacilitate,
    openFacilitation,
    actionItems,
    canAddActionItems,
    addingActionItem,
    setAddingActionItem,
    addActionItem,
    updateActionItem,
    toggleActionItem,
    deleteActionItem,
  };

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}