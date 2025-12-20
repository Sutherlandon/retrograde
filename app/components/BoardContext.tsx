import { createContext, useContext, useState, useEffect } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { nanoid } from "nanoid";
import type { Board, BoardState, Column } from "~/server/board.types";

const defaultBoard: Board = {
  id: "default-board",
  title: "Default Board",
  next_col_order: 1,
  columns: [{ id: 'col-1', title: 'Column 1', col_order: 0, notes: [] }],
  offline: false,
  timerRunning: false,
  timerEndsAt: null,
  timeLeft: null,
  addNote: () => { },
  addColumn: () => { },
  updateColumnTitle: () => { },
  deleteColumn: () => { },
  updateNote: () => { },
  deleteNote: () => { },
  moveNote: () => { },
  startTimer: () => { },
  stopTimer: () => { },
};

const BoardContext = createContext<Board>(defaultBoard);

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const loaderData = useLoaderData() as BoardState;
  const fetcher = useFetcher();
  const [columns, setColumns] = useState(loaderData.columns);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerEndsAt, setTimerEndsAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);
  const { revalidate } = useRevalidator();
  const boardId = loaderData.id;

  const sendAction = ({ type, board_id, payload }: { type: string, board_id: string, payload: any }) => {
    // no DB actions on example board
    if (board_id === "example-board")
      return;

    fetcher.submit(
      { type, payload: JSON.stringify(payload) },
      {
        method: "post",
        action: `/board/${board_id}`
      }
    );
  }

  /**
   * Update the local state with results from the last server action
   */
  useEffect(() => {
    if (fetcher.data) {
      console.log("Fetcher data received:", fetcher.data);
      setColumns(fetcher.data.columns);
    }
  }, [fetcher.data]);

  /**
   * Merge server updates with local state (e.g. new notes being edited locally)
   */
  useEffect(() => {
    setColumns((prevCols) => {
      return loaderData.columns.map((serverCol) => {
        const localCol = prevCols.find((c) => c.id === serverCol.id);

        if (!localCol) {
          // new column from server
          return serverCol;
        }

        // get all the server side updates, and new notes
        const notes = serverCol.notes.map((serverNote) => {
          const localNote = localCol.notes.find((n) => n.id === serverNote.id);

          if (!localNote) {
            // new note from server
            return serverNote;
          }

          // if the local note is new, it won't be on the server yet 
          // otherwise, take the server version
          return localNote.is_new
            ? { ...serverNote, text: localNote.text }
            : serverNote;
        });

        // keep any new notes being edited
        const newNote = localCol.notes.find((n) => n.is_new);
        if (newNote) {
          notes.push(newNote);
        }

        const mergedColumn = { ...serverCol, notes };

        return mergedColumn
      });
    });
  }, [loaderData]);

  /**
   * Periodically revalidate to get server-side updates (e.g. from other users)
   */
  useEffect(() => {
    // no revalidation on example board
    if (boardId === "example-board") return;

    let cancelled = false;

    async function safeRevalidate() {
      try {
        await revalidate(); // triggers loader
        if (!cancelled) {
          setOffline(false);
        }
      } catch (err) {
        console.error("Revalidation error:", err);
        // Browser/network failure -> TypeError("Failed to fetch")
        if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
          if (!cancelled) {
            console.warn("Server unreachable, going offline");
            setOffline(true);
          }
          return; // prevent bubbling into router errorBoundary
        }

        // Non-network errors should still bubble to router boundaries
        throw err;
      }
    }

    const interval = setInterval(safeRevalidate, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [revalidate, boardId, setOffline]);

  // Detect a timer state changea from the server
  useEffect(() => {
    if (!loaderData) return;

    // server truth
    const serverRunning = loaderData.timerRunning;
    const serverEndsAt = loaderData.timerEndsAt;

    // client not running but server is → start it
    if (serverRunning && !timerRunning) {
      setTimerRunning(true);
      setTimerEndsAt(serverEndsAt);
      return;
    }

    // client running but server stopped → stop it
    if (!serverRunning && timerRunning) {
      setTimerRunning(false);
      setTimerEndsAt(null);
      return;
    }

    // both running → keep end time in sync (important!)
    if (serverRunning && timerRunning) {
      if (serverEndsAt !== timerEndsAt) {
        setTimerEndsAt(serverEndsAt);
      }
    }
  }, [loaderData?.timerRunning, loaderData?.timerEndsAt]);


  // Local countdown derived from endsAt
  useEffect(() => {
    if (!timerRunning || !timerEndsAt) {
      setTimeLeft(null);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(timerEndsAt).getTime() - Date.now()) / 1000));

      setTimeLeft(diff);
      if (diff === 0) {
        setTimerRunning(false);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerEndsAt]);


  // Creates a new column with a default title
  const addColumn = () => {
    if (columns.length >= 12)
      return confirm("You have reached the maximum of 12 columns.)");

    const newCol: Column = {
      id: nanoid(),
      title: `Column ${loaderData.next_col_order}`,
      col_order: loaderData.next_col_order,
      notes: []
    };

    setColumns([...columns, newCol].sort((a, b) => a.col_order - b.col_order));
    sendAction({
      board_id: boardId,
      type: "addColumn",
      payload: {
        id: newCol.id,
        title: `Column ${loaderData.next_col_order}`,
        col_order: newCol.col_order
      }
    });
  };

  // Updates the title of a column
  const updateColumnTitle = (id: string, newTitle: string) => {
    setColumns((cols) =>
      cols.map((c) => c.id === id
        ? { ...c, title: newTitle }
        : c
      )
    );
    sendAction({
      board_id: boardId,
      type: "updateColumnTitle",
      payload: { id, newTitle }
    });
  };

  // deletes a column after confirmation
  const deleteColumn = (id: string) => {
    setColumns((cols) => cols.filter((c) => c.id !== id));
    sendAction({
      board_id: boardId,
      type: "deleteColumn",
      payload: { id }
    });
  };

  // adds a new blank note to a column
  const addNote = (columnId: string) => {
    const newNote = {
      id: nanoid(),
      text: "",
      likes: 0,
      is_new: true,
      column_id: columnId,
      created: Date.now().toString(),
    };
    setColumns((cols) =>
      cols.map((c) => c.id === columnId
        ? { ...c, notes: [...c.notes, newNote] }
        : c
      )
    );
  };

  // updates the text and likes of a note
  const updateNote = (columnId: string, noteId: string, newText: string, likes: number, created: string) => {
    setColumns((cols) =>
      cols.map((c) =>
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
    sendAction({
      board_id: boardId,
      type: "updateNote",
      payload: { columnId, noteId, newText, likes, created }
    });
  };

  // deletes a note after confirmation if it has text
  const deleteNote = (columnId: string, noteId: string, text?: string) => {
    setColumns((cols) =>
      cols.map((c) =>
        c.id === columnId
          ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) }
          : c
      )
    );
    if (text) {
      sendAction({
        board_id: boardId,
        type: "deleteNote",
        payload: { columnId, noteId }
      });
    }
  };

  // moves a note from one column to another
  const moveNote = (fromcolumnId: string, tocolumnId: string, noteId: string) => {
    if (fromcolumnId === tocolumnId) return;
    let movedNote: any = null;

    const newCols = columns.map((col) => {
      if (col.id === fromcolumnId) {
        const note = col.notes.find((n) => n.id === noteId);
        if (note) movedNote = note;
        return { ...col, notes: col.notes.filter((n) => n.id !== noteId) };
      }
      return col;
    });

    // add the note to the target column
    if (movedNote) {
      setColumns(
        newCols.map((col) =>
          col.id === tocolumnId
            ? { ...col, notes: [...col.notes, movedNote] }
            : col
        )
      );
      sendAction({
        board_id: boardId,
        type: "moveNote",
        payload: { fromcolumnId, tocolumnId, noteId },
      });
    }
  };

  // starts a timer for the given number of minutes
  const startTimer = (minutes: number) => {
    // prevent duplicate timers
    if (timerRunning || fetcher.state !== "idle") return;

    // optimistic update
    const endsAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    setTimerRunning(true);
    setTimerEndsAt(endsAt);

    // no DB actions on example board
    if (boardId === "example-board") return;

    fetcher.submit(
      {
        type: "startTimer",
        payload: JSON.stringify({ minutes }),
      },
      {
        method: "post",
      }
    );
  };

  // stops an active timer
  const stopTimer = () => {
    if (!timerRunning || fetcher.state !== "idle") return;

    // optimistic update
    setTimerRunning(false);
    setTimerEndsAt(null);

    // no DB actions on example board
    if (boardId === "example-board") return;

    fetcher.submit(
      {
        type: "stopTimer",
        payload: JSON.stringify({}),
      },
      {
        method: "post",
      }
    );
  };



  return (
    <BoardContext.Provider
      value={{
        columns,
        id: boardId,
        title: loaderData.title,
        next_col_order: loaderData.next_col_order,
        offline,
        timerRunning,
        timerEndsAt,
        timeLeft,
        addColumn,
        updateColumnTitle,
        deleteColumn,
        addNote,
        updateNote,
        deleteNote,
        moveNote,
        startTimer,
        stopTimer
      }}
    >
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard() {
  return useContext(BoardContext);
}
