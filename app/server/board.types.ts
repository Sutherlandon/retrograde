// boardStore.types.ts

export interface Note {
  id: string;
  text: string;
  likes: number;
  new: boolean;
}

export interface Column {
  id: string;
  title: string;
  notes: Note[];
  col_order: number;
}

export interface BoardState {
  id: string;
  title: string;
  columns: Column[];
  next_col_order: number; // Optional: for client-side use only
}

// Optional: separate "modifier" interfaces if you still want client-only methods
export interface BoardModifier {
  addColumn: () => void;
  updateColumnTitle: (id: string, newTitle: string) => void;
  deleteColumn: (id: string) => void;
  addNote: (columnId: string, text?: string) => void;
  updateNote: (
    columnId: string,
    noteId: string,
    newText: string,
    likeCount: number
  ) => void;
  deleteNote: (columnId: string, noteId: string, text?: string) => void;
  moveNote: (
    fromcolumnId: string,
    tocolumnId: string,
    noteId: string
  ) => void;
}

export interface Board extends BoardState, BoardModifier { }

export interface BoardCollection {
  boards: BoardState[];
  get: (id: string) => BoardState;
  create: (id: string, title: string) => void;
}
