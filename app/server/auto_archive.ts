// app/server/auto_archive.ts
// Auto-archive cron logic. See ADR-0005.
//
// A board is archived 30 days after `created_at` when:
//   - team_id IS NULL                    (free-tier trial board)
//   - archived_at IS NULL                (not already archived)
//   - created_at > GRANDFATHER_CUTOFF    (post-feature; existing boards exempt)
//
// Boards on a team (personal or otherwise) are never auto-archived: being on
// a team signals "this matters and I have an account here."

import { pool, selfHosted } from "./db_config";
import { GRANDFATHER_CUTOFF, FREE_TIER_TTL_DAYS } from "~/config/grandfather";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The moment archiveStaleBoards becomes free to take this board, as an ISO
 * string, or null when it never will. Mirrors that query's WHERE clause so the
 * date a guest sees on the board is the rule that will be applied. The job
 * runs daily, so the board goes on its first run after this moment.
 */
export function archiveDateFor(board: {
  team_id?: string | null;
  createdAt?: string;
  archivedAt?: string | null;
}): string | null {
  // A self-hosted instance runs no scheduled cleanup (ADR-0020).
  if (selfHosted || board.team_id || board.archivedAt || !board.createdAt) return null;
  const created = new Date(board.createdAt).getTime();
  if (Number.isNaN(created) || created <= new Date(GRANDFATHER_CUTOFF).getTime()) return null;
  return new Date(created + FREE_TIER_TTL_DAYS * DAY_MS).toISOString();
}

export interface ArchiveStaleResult {
  archived: number;
}

export async function archiveStaleBoards(): Promise<ArchiveStaleResult> {
  const res = await pool.query(
    `UPDATE boards
     SET archived_at = NOW()
     WHERE team_id IS NULL
       AND archived_at IS NULL
       AND created_at > $1::timestamptz
       AND created_at < NOW() - ($2 || ' days')::interval`,
    [GRANDFATHER_CUTOFF, String(FREE_TIER_TTL_DAYS)]
  );
  return { archived: res.rowCount ?? 0 };
}
