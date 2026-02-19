// ---------------------------------------------------------------------------
// board.types.ts
// Three distinct layers — never mix them.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. SERVER / WIRE TYPES — exactly what the DB returns. No client concerns.
// ---------------------------------------------------------------------------

export interface NoteDTO {
  id: string;
  column_id: string;
  text: string;
  likes: number;
  is_new: boolean;
  created: string;
}

export interface ColumnDTO {
  id: string;
  title: string;
  col_order: number;
  notes: NoteDTO[];
}

export interface BoardDTO {
  id: string;
  title: string;
  readonly: boolean;       // true for example boards — server sets this
  timerRunning: boolean;
  timerStartedAt: string | null;
  timerEndsAt: string | null;
  columns: ColumnDTO[];
}

// ---------------------------------------------------------------------------
// 2. CLIENT STATE — what BoardContext actually holds in memory.
//    Extends DTO with ephemeral client-only fields.
// ---------------------------------------------------------------------------

export interface Note extends NoteDTO { }   // identical for now, alias for clarity

export interface Column extends ColumnDTO {
  notes: Note[];
}

export interface BoardClientState {
  id: string;
  title: string;
  readonly: boolean;
  columns: Column[];
  // Derived on client from columns — NOT from the server
  nextColOrder: number;
  // Timer — driven from server but kept in local state for countdown UX
  timerRunning: boolean;
  timerEndsAt: string | null;
  timeLeft: number | null;          // seconds remaining, ticked by interval
  // Network status
  offline: boolean;
}

// ---------------------------------------------------------------------------
// 3. ACTIONS — the mutation interface exposed by BoardContext.
//    Each maps to a specific resource route action.
// ---------------------------------------------------------------------------

export interface BoardActions {
  addColumn: () => void;
  updateColumnTitle: (id: string, newTitle: string) => void;
  deleteColumn: (id: string) => void;
  addNote: (columnId: string) => void;
  updateNote: (columnId: string, noteId: string, newText: string, likes: number, created: string) => void;
  likeNote: (noteId: string, delta: number) => void;
  deleteNote: (columnId: string, noteId: string, text?: string) => void;
  moveNote: (fromColumnId: string, toColumnId: string, noteId: string) => void;
  startTimer: (seconds: number) => void;
  stopTimer: () => void;
}

// ---------------------------------------------------------------------------
// 4. COMPOSED TYPE — what useBoard() returns
// ---------------------------------------------------------------------------

export type Board = BoardClientState & BoardActions;