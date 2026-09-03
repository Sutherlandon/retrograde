// app/example-data/example_board_ids.ts
// Canonical ids for the read-only example/tutorial boards (BRD-017). These
// boards are served from static fixtures in this directory and never touch
// the database, so an anonymous visitor must never be linked to one via
// users.board_id — no matching `boards` row exists for them (BRD-017 /
// db_init.ts's nullable users.board_id FK). Single source of truth for both
// the board.tsx loader short-circuit and the anonymous-user linkage decision
// in app/hooks/useAuth.ts.
export const EXAMPLE_BOARD_IDS = ["example-board", "example-board-real-world"] as const;

export function isExampleBoardId(boardId: string): boolean {
  return (EXAMPLE_BOARD_IDS as readonly string[]).includes(boardId);
}
