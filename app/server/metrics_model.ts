// app/server/metrics_model.ts
// Aggregate metrics queries for the admin dashboard.
// Returns counts only — no PII, no per-user data.

import { pool } from "./db_config";

export interface MetricsDTO {
  registeredUsers: number; // non-anonymous accounts
  totalNotes: number;      // all notes in the database
  activeBoards: number;    // boards with real usage (see definition below)
  engagedUsers: number;    // registered users who are members of active boards
}

// A board is considered "active" (used beyond a quick test) when either:
//   - At least one note was created by someone other than the board owner, OR
//   - The board owner has created 5 or more notes on the board themselves.
const ACTIVE_BOARDS_CTE = `
  active_boards AS (
    SELECT b.id
    FROM boards b
    WHERE b.created_by IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM notes n
          JOIN columns c ON n.column_id = c.id
          WHERE c.board_id = b.id
            AND n.created_by IS NOT NULL
            AND n.created_by != b.created_by
        )
        OR (
          SELECT COUNT(*)
          FROM notes n
          JOIN columns c ON n.column_id = c.id
          WHERE c.board_id = b.id
            AND n.created_by = b.created_by
        ) >= 5
      )
  )
`;

export async function getMetrics(): Promise<MetricsDTO> {
  const result = await pool.query(`
    WITH ${ACTIVE_BOARDS_CTE}
    SELECT
      (SELECT COUNT(*) FROM users   WHERE is_anonymous = FALSE)::int  AS "registeredUsers",
      (SELECT COUNT(*) FROM notes)::int                               AS "totalNotes",
      (SELECT COUNT(*) FROM active_boards)::int                       AS "activeBoards",
      (
        SELECT COUNT(DISTINCT u.id)
        FROM users u
        JOIN board_members bm ON bm.user_id = u.id
        WHERE u.is_anonymous = FALSE
          AND EXISTS (
            SELECT 1 FROM active_boards ab WHERE ab.id = bm.board_id
          )
      )::int                                                          AS "engagedUsers"
  `);

  return result.rows[0];
}
