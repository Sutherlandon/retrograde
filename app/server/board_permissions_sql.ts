// app/server/board_permissions_sql.ts
// The SQL predicates behind board facilitation and board lifecycle, written
// once so every query that computes them agrees (ADR-0006, ADR-0027). Plain
// strings with no imports, so the model layer can embed them without pulling
// in the request-level guards in board_permissions.ts.
//
// `board` is the alias of a `boards` row in the enclosing query; `user` is a
// parameter expression for the caller's id. Cast it ("$2::uuid"): its first
// use is `IS NOT NULL`, from which Postgres cannot infer a parameter's type.

/**
 * May the user facilitate the board? Everyone when open_facilitation is on;
 * otherwise the board's owner, a granted facilitator, or the owner of the
 * board's crew (ADR-0027).
 */
export function canFacilitateSql(board: string, user: string): string {
  return `(
    ${board}.open_facilitation OR (
      ${user} IS NOT NULL AND (
        EXISTS (
          SELECT 1 FROM board_members fbm
          WHERE fbm.board_id = ${board}.id AND fbm.user_id = ${user}
            AND fbm.role IN ('owner', 'facilitator')
        )
        OR EXISTS (
          SELECT 1 FROM team_members ftm
          WHERE ftm.team_id = ${board}.team_id AND ftm.user_id = ${user} AND ftm.role = 'owner'
        )
      )
    )
  )`;
}

/**
 * May the user delete, archive or unarchive the board? Its owner (ADR-0006),
 * or the owner of its crew when the board's owner is the agent of one of that
 * crew's API keys (ADR-0027). A board a human owns stays that human's alone.
 * A revoked key still counts: its agent's boards are the ones nobody else
 * could reach.
 */
export function canManageBoardSql(board: string, user: string): string {
  return `(
    EXISTS (
      SELECT 1 FROM board_members lbm
      WHERE lbm.board_id = ${board}.id AND lbm.user_id = ${user} AND lbm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM board_members abm
      JOIN api_keys lak ON lak.agent_user_id = abm.user_id AND lak.team_id = ${board}.team_id
      JOIN team_members ltm ON ltm.team_id = ${board}.team_id AND ltm.user_id = ${user} AND ltm.role = 'owner'
      WHERE abm.board_id = ${board}.id AND abm.role = 'owner'
    )
  )`;
}
