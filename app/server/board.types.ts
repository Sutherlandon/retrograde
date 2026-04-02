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
  votes?: number;
  user_voted?: boolean;
  is_new: boolean;
  created: string;
  note_order: number;
}

export interface ColumnDTO {
  id: string;
  title: string;
  prompt: string;
  col_order: number;
  notes: NoteDTO[];
}

export interface AttachmentDTO {
  id: string;
  board_id: string;
  filename: string;
  link: string | null;
  type: "link" | "image";
  image_data: string | null;
  created_at: string;
}

export interface BoardDTO {
  id: string;
  title: string;
  readonly: boolean;       // true for example boards — server sets this
  isOwner?: boolean;       // true when the current user is the board owner
  timerRunning: boolean;
  timerStartedAt: string | null;
  timerEndsAt: string | null;
  votingEnabled?: boolean;
  votingAllowed?: number;
  columns: ColumnDTO[];
  attachments?: AttachmentDTO[];
}

// ---------------------------------------------------------------------------
// 2. CLIENT STATE — what BoardContext actually holds in memory.
//    Extends DTO with ephemeral client-only fields.
// ---------------------------------------------------------------------------

export interface Note extends NoteDTO { }   // identical for now, alias for clarity
export interface Attachment extends AttachmentDTO { }

export interface Column extends ColumnDTO {
  notes: Note[];
}

export interface BoardClientState {
  id: string;
  title: string;
  readonly: boolean;
  isOwner: boolean;
  columns: Column[];
  // Derived on client from columns — NOT from the server
  nextColOrder: number;
  // Timer — driven from server but kept in local state for countdown UX
  timerRunning: boolean;
  timerEndsAt: string | null;
  timeLeft: number | null;          // seconds remaining, ticked by interval
  // Attachments
  attachments: Attachment[];
  // Network status
  offline: boolean;
  // Voting
  votingEnabled: boolean;
  votingAllowed: number;
}

// ---------------------------------------------------------------------------
// 3. ACTIONS — the mutation interface exposed by BoardContext.
//    Each maps to a specific resource route action.
// ---------------------------------------------------------------------------

export interface BoardActions {
  updateTitle: (newTitle: string) => void;
  addColumn: () => void;
  updateColumnTitle: (id: string, newTitle: string) => void;
  updateColumnPrompt: (id: string, prompt: string) => void;
  deleteColumn: (id: string) => void;
  addNote: (columnId: string) => void;
  updateNote: (columnId: string, noteId: string, newText: string, likes: number, created: string) => void;
  likeNote: (noteId: string, delta: number) => void;
  voteNote: (noteId: string) => void;
  updateBoardSettings: (votingEnabled: boolean, votingAllowed: number) => void;
  deleteNote: (columnId: string, noteId: string, text?: string) => void;
  moveNote: (fromColumnId: string, toColumnId: string, noteId: string) => void;
  reorderNote: (fromColumnId: string, toColumnId: string, noteId: string, newIndex: number) => void;
  moveNoteLocally: (fromColumnId: string, toColumnId: string, noteId: string, newIndex: number) => void;
  startTimer: (seconds: number) => void;
  stopTimer: () => void;
  addLinkAttachment: (filename: string, link: string) => void;
  addImageAttachment: (filename: string, imageData: string) => void;
  deleteAttachment: (attachmentId: string) => void;
}

// ---------------------------------------------------------------------------
// 4. COMPOSED TYPE — what useBoard() returns
// ---------------------------------------------------------------------------

export type Board = BoardClientState & BoardActions;