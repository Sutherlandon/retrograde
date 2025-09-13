export interface Note {
  id: string;
  text: string;
  likes: number
}

export interface Column {
  id: string;
  title: string;
  notes: Note[];
}

export interface BoardState {
  columns: Column[];
}

export interface BoardModifier {
  addColumn: (id: string, title: string) => void;
  updateColumnTitle: (id: string, newTitle: string) => void;
  deleteColumn: (id: string) => void;
  addNote: (columnId: string, text?: string) => void;
  updateNote: (colId: string, noteId: string, newText: string, likeCount: number) => void;
  deleteNote: (colId: string, noteId: string, text?: string) => void;
  moveNote: (fromColId: string, toColId: string, noteId: string) => void;
}

export interface Board extends BoardState, BoardModifier { }

let board: BoardState = {
  columns: [{ id: 'col-1', title: "Column 1", notes: [] }],
};

export function getBoardServer(): BoardState {
  return board;
}

export function addColumnServer(id: string, title: string): Column {
  const newCol: Column = { id, title, notes: [] };
  board.columns.push(newCol);
  console.log(board);
  return newCol;
}

export function updateColumnTitleServer(id: string, newTitle: string) {
  board.columns = board.columns.map((c) =>
    c.id === id ? { ...c, title: newTitle } : c
  );
  console.log(board);
}

export function deleteColumnServer(id: string) {
  board.columns = board.columns.filter((c) => c.id !== id);
  console.log(board);
}

export function addNoteServer(id: string, columnId: string, text = ""): Note | null {
  const col = board.columns.find((c) => c.id === columnId);
  if (!col) return null;
  const newNote: Note = { id, text, likes: 0 };
  col.notes.push(newNote);
  return newNote;
  console.log(board);
}

export function updateNoteServer(colId: string, noteId: string, newText: string, likeCount: number) {
  board.columns = board.columns.map((c) =>
    c.id === colId
      ? {
        ...c,
        notes: c.notes.map((n) =>
          n.id === noteId ? { ...n, text: newText, likes: likeCount } : n
        ),
      }
      : c
  );
  console.log(board);
}

export function deleteNoteServer(colId: string, noteId: string) {
  board.columns = board.columns.map((c) =>
    c.id === colId ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) } : c
  );
  console.log(board);
}

export function moveNoteServer(fromColId: string, toColId: string, noteId: string) {
  if (fromColId === toColId) return;
  let movedNote: Note | null = null;

  board.columns = board.columns.map((c) => {
    if (c.id === fromColId) {
      const note = c.notes.find((n) => n.id === noteId);
      if (note) movedNote = note;
      return { ...c, notes: c.notes.filter((n) => n.id !== noteId) };
    }
    return c;
  });

  if (movedNote) {
    board.columns = board.columns.map((c) =>
      c.id === toColId ? { ...c, notes: [...c.notes, movedNote!] } : c
    );
  }
  console.log(board);
}
