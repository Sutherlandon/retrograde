// app/server/board_permissions.ts
// Shared authorization checks for board mutations. See ADR-0006.
//
// Facilitation = owner OR granted facilitator role OR the board has
// open_facilitation enabled (in which case anyone may facilitate).

import { redirect } from "react-router";
import { pool } from "./db_config";
import { getApiUser, getOptionalUser } from "~/hooks/useAuth";

export async function userCanFacilitate(
  userId: string | null,
  boardId: string
): Promise<boolean> {
  const res = await pool.query<{ can: boolean }>(
    `SELECT (
       b.open_facilitation
       OR (
         $2::uuid IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM board_members bm
           WHERE bm.board_id = b.id
             AND bm.user_id = $2::uuid
             AND bm.role IN ('owner', 'facilitator')
         )
       )
     ) AS can
     FROM boards b WHERE b.id = $1`,
    [boardId, userId]
  );
  if (res.rowCount === 0) return false;
  return res.rows[0].can === true;
}

/**
 * Throws 401 (no session) / 403 (session but not permitted) unless the caller
 * can facilitate this board. Returns the caller (null is possible when
 * open_facilitation admits an unauthenticated caller).
 */
export async function requireFacilitator(request: Request, boardId: string) {
  const user = await getOptionalUser(request);
  const allowed = await userCanFacilitate(user?.id ?? null, boardId);
  if (!allowed) {
    if (!user) throw new Response("Unauthorized", { status: 401 });
    throw new Response("Facilitator access required", { status: 403 });
  }
  return user;
}

// ---------------------------------------------------------------------------
// Crew board access (ADR-0003 restriction) — a board on a members-only crew
// can only be opened by that crew's members (or the board's own members).
// ---------------------------------------------------------------------------

interface BoardAccess {
  exists: boolean;
  allowed: boolean;
  userIsRegistered: boolean;
}

/**
 * Resolve whether `userId` (and optionally an API-key's `apiTeamId`) may access
 * a board. Access is open when the board is teamless or its crew isn't
 * restricted; otherwise it's limited to crew members, the board's own
 * owner/facilitators, and agents whose key belongs to the board's crew.
 */
export async function getBoardAccess(
  boardId: string,
  userId: string | null,
  apiTeamId?: string | null
): Promise<BoardAccess> {
  const res = await pool.query<{
    team_id: string | null;
    restricted: boolean;
    is_team_member: boolean;
    is_board_member: boolean;
    is_registered: boolean;
  }>(
    `SELECT
       b.team_id,
       COALESCE(t.restrict_board_access, FALSE) AS restricted,
       EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id = b.team_id AND tm.user_id = $2::uuid) AS is_team_member,
       EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = $2::uuid) AS is_board_member,
       EXISTS(SELECT 1 FROM users u WHERE u.id = $2::uuid AND NOT u.is_anonymous) AS is_registered
     FROM boards b
     LEFT JOIN teams t ON t.id = b.team_id
     WHERE b.id = $1`,
    [boardId, userId]
  );

  if (res.rowCount === 0) return { exists: false, allowed: false, userIsRegistered: false };

  const row = res.rows[0];
  const allowed =
    !row.team_id ||
    !row.restricted ||
    row.is_team_member ||
    row.is_board_member ||
    (!!apiTeamId && apiTeamId === row.team_id);

  return { exists: true, allowed, userIsRegistered: row.is_registered };
}

// ---------------------------------------------------------------------------
// Locks (GAP-003) — `notes_locked` and `board_locked` were, until now, a UI
// convention only: no route re-checked them, so a direct request wrote
// straight through a locked board. Facilitators do NOT bypass either lock —
// the client blocks everyone, including the owner, and the server matches
// that. The one deliberate exception is `board.settings.ts`, which stays
// unguarded by locks because toggling them off is the only way a locked
// board gets unlocked again.
//
// The matrix below was derived by reading the client (Note.tsx, Column.tsx,
// CommandDeck.tsx, BoardToolbar.tsx, ActionItemsPanel.tsx) for every place a
// control is disabled because of `notesLocked` / `boardLocked`.
//
// | Registry ID(s)         | Action                              | notes_locked | board_locked | Enforced in              |
// |-------------------------|--------------------------------------|:---:|:---:|----------------------------|
// | BRD-003                 | Edit board title                     |  —  |  X  | board.title.ts             |
// | BRD-004                 | Add a note                           |  X  |  X  | board.notes.ts             |
// | BRD-005                 | Edit a note                          |  X  |  X  | board.notes.ts             |
// | BRD-006                 | Delete a note                        |  X  |  X  | board.notes.ts             |
// | BRD-007                 | Move a note between columns (drag)   |  X  |  X  | board.notes.ts             |
// | BRD-008                 | Reorder notes within a column (drag) |  X  |  X  | board.notes.ts             |
// | BRD-009                 | Like a note                          |  —  |  X  | board.notes.ts             |
// | BRD-010                 | Vote / unvote a note                 |  —  |  X  | board.notes.ts             |
// | BRD-011                 | Edit a column title                  |  X  |  X  | board.columns.ts (PATCH)   |
// | BRD-012                 | Column prompt add/edit/delete        |  —  |  X  | board.columns.ts (PATCH)   |
// | BRD-013                 | Delete a column                      |  —  |  X  | board.columns.ts (DELETE)  |
// | DECK-002/DECK-003       | Start / stop the timer               |  —  |  X  | board.timer.ts             |
// | DECK-006                | Add a column                         |  —  |  X  | board.columns.ts (POST)    |
// | BRD-014, DECK-023–025   | Action item complete / add / edit / delete | — | X | board.action-items.ts        |
// | DECK-017–019             | Attach / delete an attachment         |  —  |  —  | never locked — gated by `requireFacilitator` only |
// | DECK-008–016             | Board settings, incl. the locks themselves | — | — | never locked — `board.settings.ts` is how a board unlocks |
//
// "—" means the client never disables that control for that lock. notes_locked
// never applies to action items — they aren't notes.

export async function requireUnlocked(
  boardId: string,
  flags: { notes?: boolean; board?: boolean }
): Promise<void> {
  const res = await pool.query<{ notes_locked: boolean; board_locked: boolean }>(
    `SELECT notes_locked, board_locked FROM boards WHERE id = $1`,
    [boardId]
  );
  if (res.rowCount === 0) return; // missing board — the caller's own access check already 404s

  const { notes_locked, board_locked } = res.rows[0];
  if (flags.board && board_locked) {
    throw new Response("Board is locked", { status: 423 });
  }
  if (flags.notes && (notes_locked || board_locked)) {
    throw new Response("Notes are locked", { status: 423 });
  }
}

/**
 * Guard a board route by access. Throws 404 (missing), a login redirect or 401
 * (anonymous caller who might be a member once signed in), or 403 (a registered
 * non-member). `loginRedirect` is for the page loader; resource/API routes get
 * a 401 instead so fetchers don't chase a redirect. Returns the caller.
 */
export async function requireBoardAccess(
  request: Request,
  boardId: string,
  opts: { loginRedirect?: boolean } = {}
) {
  const user = await getApiUser(request);
  const apiTeamId = (user as { teamId?: string } | null)?.teamId ?? null;
  const access = await getBoardAccess(boardId, user?.id ?? null, apiTeamId);

  if (!access.exists) throw new Response("Board Not Found", { status: 404 });
  if (!access.allowed) {
    if (!access.userIsRegistered) {
      if (opts.loginRedirect) {
        const returnTo = new URL(request.url).pathname;
        throw redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
      }
      throw new Response("Unauthorized", { status: 401 });
    }
    throw new Response("This board is restricted to its crew", { status: 403 });
  }
  return user;
}
