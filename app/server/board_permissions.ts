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
