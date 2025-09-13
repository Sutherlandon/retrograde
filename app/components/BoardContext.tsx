import { createContext, useContext, useState } from "react";
import type { Note, Board } from "~/server/boardStore";
import { useFetcher, useLoaderData } from "react-router";

const defaultBoard: Board = {
  columns: [{ id: 'col-1', title: 'Column 1', notes: [] }],
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
  const [columns, setColumns] = useState(defaultBoard.columns);
  const loaderData = useLoaderData() as Board;
  const fetcher = useFetcher();

  const sendAction = ({ type, payload }: { type: string, payload: any }) => {
    fetcher.submit({ type, payload: JSON.stringify(payload) }, { method: "post", action: "/board" });
  }

  const addColumn = () => {
    if (columns.length >= 10) return;
    const newCol = { id: Date.now().toString(), title: `Column ${columns.length + 1}`, notes: [] };
    setColumns([...columns, newCol]);
    sendAction({
      type: "addColumn",
      payload: { id: newCol.id, title: `Column ${columns.length + 1}` }
    });
  };

  const updateColumnTitle = (id: string, newTitle: string) => {
    setColumns((cols) =>
      cols.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
    );
    sendAction({
      type: "updateColumnTitle",
      payload: { id, newTitle }
    });
  };

  const deleteColumn = (id: string) => {
    if (confirm("Are you sure you want to delete this column?")) {
      setColumns((cols) => cols.filter((c) => c.id !== id));
      sendAction({
        type: "deleteColumn",
        payload: { id }
      });
    }
  };

  const addNote = (columnId: string, text: string = "") => {
    const newNote = { id: Date.now().toString(), text, likes: 0 };
    setColumns((cols) =>
      cols.map((c) =>
        c.id === columnId
          ? { ...c, notes: [...c.notes, newNote] }
          : c
      )
    );
    sendAction({
      type: "addNote",
      payload: { id: newNote.id, columnId, text }
    });
  };

  const updateNote = (colId: string, noteId: string, newText: string, likeCount: number) => {
    setColumns((cols) =>
      cols.map((c) =>
        c.id === colId
          ? {
            ...c,
            notes: c.notes.map((n) =>
              n.id === noteId ? { ...n, text: newText, likes: likeCount } : n
            ),
          }
          : c
      )
    );
    sendAction({
      type: "updateNote",
      payload: { colId, noteId, newText, likes: likeCount }
    });
  };

  const deleteNote = (colId: string, noteId: string, text?: string) => {
    if (!text || confirm("Are you sure you want to delete this note?")) {
      setColumns((cols) =>
        cols.map((c) =>
          c.id === colId
            ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) }
            : c
        )
      );
    }
    sendAction({
      type: "deleteNote",
      payload: { colId, noteId }
    });
  };

  const moveNote = (fromColId: string, toColId: string, noteId: string) => {
    if (fromColId === toColId) return;
    let movedNote: any = null;

    const newCols = columns.map((col) => {
      if (col.id === fromColId) {
        const note = col.notes.find((n) => n.id === noteId);
        if (note) movedNote = note;
        return { ...col, notes: col.notes.filter((n) => n.id !== noteId) };
      }
      return col;
    });

    if (movedNote) {
      setColumns(
        newCols.map((col) =>
          col.id === toColId
            ? { ...col, notes: [...col.notes, movedNote] }
            : col
        )
      );
      sendAction({
        type: "moveNote",
        payload: { fromColId, toColId, noteId },
      });
    }
  };

  return (
    <BoardContext.Provider
      value={{
        columns,
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
