// app/server/board_permissions.ts
// Shared authorization checks for board mutations. See ADR-0006.
//
// Facilitation = owner OR granted facilitator role OR the board has
// open_facilitation enabled (in which case anyone may facilitate).

import { pool } from "./db_config";
import { getOptionalUser } from "~/hooks/useAuth";

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
