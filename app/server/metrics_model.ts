// app/server/metrics_model.ts
// Aggregate metrics queries for the admin dashboard.
// Returns counts only — no PII, no per-user data.

import { pool } from "./db_config";

export interface MetricsDTO {
  registeredUsers: number; // non-anonymous accounts
  totalNotes: number;      // all notes in the database (excluding seed data)
  activeBoards: number;    // boards with real usage (see definition below)
  engagedUsers: number;    // registered users who are members of active boards
}

// One point per week; counts are new items created that week, plus the
// cumulative registered-user total so growth reads at a glance.
export interface TrendPoint {
  weekStart: string;  // ISO date (YYYY-MM-DD) of the week's Monday
  newUsers: number;   // registered accounts created this week
  newBoards: number;  // boards created this week
  newNotes: number;   // notes created this week
  totalUsers: number; // cumulative registered users at end of this week
}

// Seed rows inserted by db_init.ts on every deployment. Excluded from all
// metrics so dev fixtures never inflate the numbers.
export const SEED_BOARD_IDS = ["dev-test"];

// notes.created stores epoch milliseconds as TEXT; legacy rows default to '1'.
// Only 13-digit values are real timestamps (covers years 2001–2286).
const VALID_NOTE_EPOCH = String.raw`^\d{13}$`;

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
      (
        SELECT COUNT(*)
        FROM notes n
        JOIN columns c ON n.column_id = c.id
        WHERE c.board_id <> ALL($1)
      )::int                                                          AS "totalNotes",
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
  `, [SEED_BOARD_IDS]);

  return result.rows[0];
}

// Weekly creation counts for the last `weeks` weeks (including the current,
// partial week). generate_series zero-fills weeks with no activity so the
// charts never skip a bucket. Only counts and week buckets leave the database.
export async function getMetricsTrends(weeks = 12): Promise<TrendPoint[]> {
  const weeklyQuery = pool.query(`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', NOW()) - ($1::int - 1) * interval '1 week',
        date_trunc('week', NOW()),
        interval '1 week'
      ) AS week_start
    )
    SELECT
      to_char(w.week_start, 'YYYY-MM-DD') AS "weekStart",
      (
        SELECT COUNT(*)
        FROM users u
        WHERE u.is_anonymous = FALSE
          AND u.created_at >= w.week_start
          AND u.created_at <  w.week_start + interval '1 week'
      )::int AS "newUsers",
      (
        SELECT COUNT(*)
        FROM boards b
        WHERE b.id <> ALL($2)
          AND b.created_at >= w.week_start
          AND b.created_at <  w.week_start + interval '1 week'
      )::int AS "newBoards",
      (
        SELECT COUNT(*)
        FROM notes n
        JOIN columns c ON n.column_id = c.id
        WHERE c.board_id <> ALL($2)
          AND n.created ~ '${VALID_NOTE_EPOCH}'
          AND to_timestamp(n.created::bigint / 1000.0) >= w.week_start
          AND to_timestamp(n.created::bigint / 1000.0) <  w.week_start + interval '1 week'
      )::int AS "newNotes"
    FROM weeks w
    ORDER BY w.week_start
  `, [weeks, SEED_BOARD_IDS]);

  // Registered users that existed before the window, so the cumulative line
  // starts from the true total rather than zero.
  const baselineQuery = pool.query(`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE is_anonymous = FALSE
      AND created_at < date_trunc('week', NOW()) - ($1::int - 1) * interval '1 week'
  `, [weeks]);

  const [weekly, baseline] = await Promise.all([weeklyQuery, baselineQuery]);

  let runningTotal: number = baseline.rows[0]?.count ?? 0;
  return weekly.rows.map((row): TrendPoint => {
    runningTotal += row.newUsers;
    return { ...row, totalUsers: runningTotal };
  });
}
