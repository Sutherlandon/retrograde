import { createContext, useContext, useState, useEffect } from "react";
import type { Board, BoardState, Column } from "~/server/board.types";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { nanoid } from "nanoid";

const defaultBoard: Board = {
  id: "default-board",
  title: "Default Board",
  next_col_order: 1,
  columns: [{ id: 'col-1', title: 'Column 1', col_order: 0, notes: [] }],
  addNote: () => { },
  addColumn: () => { },
  updateColumnTitle: () => { },
  deleteColumn: () => { },
  updateNote: () => { },
  deleteNote: () => { },
  moveNote: () => { },
};

const BoardContext = createContext<Board>(defaultBoard);

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const loaderData = useLoaderData() as BoardState;
  const [columns, setColumns] = useState(loaderData.columns);
  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();

  const sendAction = ({ type, board_id, payload }: { type: string, board_id: string, payload: any }) => {
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
          return localNote.new
            ? { ...serverNote, text: localNote.text }
            : serverNote;
        });

        // keep any new notes being edited
        const newNote = localCol.notes.find((n) => n.new);
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
    const interval = setInterval(() => {
      revalidate(); // re-runs the loader, updates useLoaderData
    }, 10000);

    return () => clearInterval(interval);
  }, [revalidate]);

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
      board_id: loaderData.id,
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
      board_id: loaderData.id,
      type: "updateColumnTitle",
      payload: { id, newTitle }
    });
  };

  // deletes a column after confirmation
  const deleteColumn = (id: string) => {
    if (confirm("Are you sure you want to delete this column?")) {
      setColumns((cols) => cols.filter((c) => c.id !== id));
      sendAction({
        board_id: loaderData.id,
        type: "deleteColumn",
        payload: { id }
      });
    }
  };

  // adds a new blank note to a column
  const addNote = (columnId: string) => {
    const newNote = {
      id: nanoid(),
      text: "",
      likes: 0,
      new: true
    };
    setColumns((cols) =>
      cols.map((c) => c.id === columnId
        ? { ...c, notes: [...c.notes, newNote] }
        : c
      )
    );
  };

  // updates the text and likes of a note
  const updateNote = (columnId: string, noteId: string, newText: string, likes: number) => {
    setColumns((cols) =>
      cols.map((c) =>
        c.id === columnId
          ? {
            ...c,
            notes: c.notes.map((n) =>
              n.id === noteId ? { ...n, text: newText, likes, new: false } : n
            ),
          }
          : c
      )
    );
    sendAction({
      board_id: loaderData.id,
      type: "updateNote",
      payload: { columnId, noteId, newText, likes }
    });
  };

  // deletes a note after confirmation if it has text
  const deleteNote = (columnId: string, noteId: string, text?: string) => {
    if (!text || confirm("Are you sure you want to delete this note?")) {
      setColumns((cols) =>
        cols.map((c) =>
          c.id === columnId
            ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) }
            : c
        )
      );
    }

    if (text) {
      sendAction({
        board_id: loaderData.id,
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
        board_id: loaderData.id,
        type: "moveNote",
        payload: { fromcolumnId, tocolumnId, noteId },
      });
    }
  };

  return (
    <BoardContext.Provider
      value={{
        columns,
        id: loaderData.id,
        title: loaderData.title,
        next_col_order: loaderData.next_col_order,
        addColumn,
        updateColumnTitle,
        deleteColumn,
        addNote,
        updateNote,
        deleteNote,
        moveNote,
      }}
    >
      {children}
    </BoardContext.Provider>
  );
}

export function useBoard() {
  return useContext(BoardContext);
}
