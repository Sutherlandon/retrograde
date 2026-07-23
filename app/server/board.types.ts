// ---------------------------------------------------------------------------
// board.types.ts
// Three distinct layers — never mix them.
// ---------------------------------------------------------------------------

export type VotingScope = "board" | "column" | "note";

// ---------------------------------------------------------------------------
// 1. SERVER / WIRE TYPES — exactly what the DB returns. No client concerns.
// ---------------------------------------------------------------------------

export interface NoteAuthorDTO {
  display_name: string;
  is_agent: boolean;
}

export interface ActionItemDTO {
  id: string;
  text: string;
  completed: boolean;
  item_order: number;
  created_at: string;
  completed_at?: string | null;
  board_id?: string | null;
  team_id?: string | null;
}

export interface TeamMemberDTO {
  user_id: string;
  username: string;
  role: string;
  created_at: string;
}

export interface BoardFacilitatorDTO {
  user_id: string;
  username: string;
  role: "owner" | "facilitator";
}

export interface NoteDTO {
  id: string;
  column_id: string;
  text: string;
  likes: number;
  votes?: number;
  user_votes?: number;
  is_new: boolean;
  created: string;
  note_order: number;
  author?: NoteAuthorDTO | null;
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
  canFacilitate?: boolean; // owner OR facilitator role OR open_facilitation — see ADR-0006
  openFacilitation?: boolean;
  team_id?: string | null; // null = teamless (trial / grandfathered); see ADR-0003
  team_name?: string | null; // crew name, null when teamless
  actionItems?: ActionItemDTO[];
  timerRunning: boolean;
  timerStartedAt: string | null;
  timerEndsAt: string | null;
  votingEnabled?: boolean;
  votingAllowed?: number;
  votingScope?: VotingScope;
  notesLocked?: boolean;
  boardLocked?: boolean;
  attributionEnabled?: boolean;
  actionItemsVisible?: boolean;
  voterCount?: number;
  contributorCount?: number;
  columns: ColumnDTO[];
  attachments?: AttachmentDTO[];
}

// A board row as listed on the dashboard / crew boards table (listVisibleBoards).
export interface DashboardBoardRow {
  id: string;
  title: string;
  team_id: string | null;
  team_name: string | null;
  role: string;              // 'owner' | 'facilitator' | 'team'
  open_action_items: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Team + API key DTOs (server-side only; UI consumes them via specific routes)
// ---------------------------------------------------------------------------

export interface TeamDTO {
  id: string;
  name: string;
  is_personal: boolean;
  created_at: string;
}

export interface ApiKeyDTO {
  id: string;
  team_id: string;
  key_prefix: string;        // e.g., "rk_live_abc1" — for display only
  display_name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

// ---------------------------------------------------------------------------
// 2. CLIENT STATE — what BoardContext actually holds in memory.
//    Extends DTO with ephemeral client-only fields.
// ---------------------------------------------------------------------------

export interface Note extends NoteDTO { }   // identical for now, alias for clarity
export interface Attachment extends AttachmentDTO { }
export interface ActionItem extends ActionItemDTO { }

export interface Column extends ColumnDTO {
  notes: Note[];
}

export interface BoardClientState {
  id: string;
  title: string;
  teamName: string | null; // crew this board belongs to, null when teamless
  readonly: boolean;
  isOwner: boolean;
  // Facilitation — owner, granted facilitator, or open_facilitation. Gates the
  // Command Deck and board-level action item management. See ADR-0006.
  canFacilitate: boolean;
  openFacilitation: boolean;
  // Action items (issue #88)
  actionItems: ActionItem[];
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
  votingScope: VotingScope;
  // Locking
  notesLocked: boolean;
  boardLocked: boolean;
  boardLockedAt: Date | null;
  // Attribution — when false, note authorship is hidden everywhere.
  // Off by default to preserve retro anonymity.
  attributionEnabled: boolean;
  // Action Items column — facilitators can hide it from the Command Deck.
  // Visible by default.
  actionItemsVisible: boolean;
  // Participation stats
  voterCount: number;
  contributorCount: number;
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
  voteNote: (noteId: string, delta: number) => void;
  updateBoardSettings: (settings: { votingEnabled: boolean; votingAllowed: number; votingScope: VotingScope; notesLocked: boolean; boardLocked: boolean; attributionEnabled: boolean; actionItemsVisible: boolean }) => void;
  deleteNote: (columnId: string, noteId: string, text?: string) => void;
  moveNote: (fromColumnId: string, toColumnId: string, noteId: string) => void;
  reorderNote: (fromColumnId: string, toColumnId: string, noteId: string, newIndex: number) => void;
  moveNoteLocally: (fromColumnId: string, toColumnId: string, noteId: string, newIndex: number) => void;
  startTimer: (seconds: number) => void;
  stopTimer: () => void;
  addLinkAttachment: (filename: string, link: string) => void;
  addImageAttachment: (filename: string, imageData: string) => void;
  deleteAttachment: (attachmentId: string) => void;
  sortNotesByScore: () => void;
  clearParticipantCounts: () => void;
  addActionItem: (text: string) => void;
  updateActionItem: (itemId: string, text: string) => void;
  toggleActionItem: (itemId: string, completed: boolean) => void;
  deleteActionItem: (itemId: string) => void;
}

// ---------------------------------------------------------------------------
// 4. COMPOSED TYPE — what useBoard() returns
// ---------------------------------------------------------------------------

export type Board = BoardClientState & BoardActions;