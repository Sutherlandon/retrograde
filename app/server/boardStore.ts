export interface Note {
  id: string;
  text: string;
  likes: number
  new: boolean;
}

export interface Column {
  id: string;
  title: string;
  notes: Note[];
}

export interface BoardState {
  id: string;
  title: string;
  columns: Column[];
}

export interface BoardModifier {
  addColumn: () => void;
  updateColumnTitle: (id: string, newTitle: string) => void;
  deleteColumn: (id: string) => void;
  addNote: (columnId: string, text?: string) => void;
  updateNote: (columnId: string, noteId: string, newText: string, likeCount: number) => void;
  deleteNote: (columnId: string, noteId: string, text?: string) => void;
  moveNote: (fromcolumnId: string, tocolumnId: string, noteId: string) => void;
}

export interface Board extends BoardState, BoardModifier { }

export interface BoardCollection {
  boards: BoardState[];
  get: (id: string) => BoardState;
  create: (id: string, title: string) => void;
}

export const collection: BoardCollection = {
  boards: [{
    id: 'example-board',
    title: "Example Board",
    columns: [
      {
        id: 'col-1',
        title: "To Do",
        notes: [
          { id: 'note-1', text: "This is a note", likes: 0, new: false },
          { id: 'note-2', text: "This is another note", likes: 2, new: false }
        ]
      },
    ]
  }],
  get(id: string) {
    const board = this.boards.find((b) => b.id === id);
    if (!board) {
      throw new Error(`Board with id ${id} not found`);
    }
    return board
  },
  create(id: string, title: string) {
    const newBoard: BoardState = {
      id,
      title,
      columns: [{ id: 'col-1', title: "Column 1", notes: [] }]
    };
    this.boards.push(newBoard);
  }
};

export function getBoardServer(id: string): BoardState | undefined {
  return collection.get(id);
}

export function addColumnServer(board_id: string, id: string, title: string): BoardState {
  const board = collection.get(board_id);
  const newCol: Column = { id, title, notes: [] };
  board.columns.push(newCol);
  console.log(board);
  return board;
}

export function updateColumnTitleServer(board_id: string, id: string, newTitle: string): BoardState {
  const board = collection.get(board_id);
  board.columns = board.columns.map((c) =>
    c.id === id ? { ...c, title: newTitle } : c
  );
  console.log(board);
  return board;
}

export function deleteColumnServer(board_id: string, id: string): BoardState {
  const board = collection.get(board_id);
  board.columns = board.columns.filter((c) => c.id !== id);
  console.log(board);
  return board;
}

export function addNoteServer(board_id: string, id: string, columnId: string, text = ""): BoardState {
  const board = collection.get(board_id);
  const col = board.columns.find((c) => c.id === columnId);
  if (!col) {
    throw new Error(`Column with id ${columnId} not found`);
  }
  const newNote: Note = { id, text, likes: 0, new: false };
  col.notes.push(newNote);
  console.log(board);
  return board;
}

export function updateNoteServer(board_id: string, columnId: string, noteId: string, newText: string, likeCount: number): BoardState {
  const board = collection.get(board_id);
  const col = board.columns.find((c) => c.id === columnId);
  if (!col) {
    throw new Error(`Column with id ${columnId} not found`);
  }
  // find note and update text, if not found add it
  const noteIndex: Note | number = col.notes.findIndex(n => n.id === noteId);
  if (noteIndex !== -1) {
    col.notes[noteIndex] = { ...col.notes[noteIndex], text: newText, likes: likeCount };
  } else {
    col.notes.push({ id: noteId, text: newText, likes: likeCount, new: false });
  }
  console.log(board);
  return board;
}

export function deleteNoteServer(board_id: string, columnId: string, noteId: string): BoardState {
  const board = collection.get(board_id);
  board.columns = board.columns.map((c) =>
    c.id === columnId ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) } : c
  );
  console.log(board);
  return board;
}

export function moveNoteServer(board_id: string, fromcolumnId: string, tocolumnId: string, noteId: string): BoardState | void {
  if (fromcolumnId === tocolumnId) return;
  const board = collection.get(board_id);
  let movedNote: Note | null = null;

  board.columns = board.columns.map((c) => {
    if (c.id === fromcolumnId) {
      const note = c.notes.find((n) => n.id === noteId);
      if (note) movedNote = note;
      return { ...c, notes: c.notes.filter((n) => n.id !== noteId) };
    }
    return c;
  });

  if (movedNote) {
    board.columns = board.columns.map((c) =>
      c.id === tocolumnId ? { ...c, notes: [...c.notes, movedNote!] } : c
    );
  }
  console.log(board);
  return board;
}
