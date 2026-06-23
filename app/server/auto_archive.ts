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

import { pool } from "./db_config";
import { GRANDFATHER_CUTOFF, FREE_TIER_TTL_DAYS } from "~/config/grandfather";

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
