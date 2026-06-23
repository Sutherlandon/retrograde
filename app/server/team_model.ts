// app/server/team_model.ts
// Team and team-membership CRUD. See ADR-0003.

import { pool } from "./db_config";
import type { TeamDTO } from "./board.types";

interface TeamRow {
  id: string;
  name: string;
  is_personal: boolean;
  created_at: string;
}

/**
 * Ensure a registered user has a personal team. Idempotent: returns the
 * existing personal team id if one already exists, otherwise creates one
 * and adds the user as owner.
 *
 * Called from the OAuth callback (so new users get one on first login) and
 * from the one-time backfill in db_init.ts (so existing users are covered).
 */
export async function ensurePersonalTeam(
  userId: string,
  handle: string
): Promise<string> {
  // Check for an existing personal team this user owns.
  const existing = await pool.query<{ team_id: string }>(
    `SELECT tm.team_id FROM team_members tm
     JOIN teams t ON t.id = tm.team_id AND t.is_personal = TRUE
     WHERE tm.user_id = $1
     LIMIT 1`,
    [userId]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0].team_id;
  }

  // Create the team + membership inside a transaction.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const teamRes = await client.query<{ id: string }>(
      `INSERT INTO teams (name, is_personal) VALUES ($1, TRUE) RETURNING id`,
      [`${handle}'s Team`]
    );
    const teamId = teamRes.rows[0].id;
    await client.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [teamId, userId]
    );
    await client.query("COMMIT");
    return teamId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get the personal team for a user, if one exists. Returns null when the user
 * has no personal team (which shouldn't happen for registered users post-backfill,
 * but might happen for newly anonymous users).
 */
export async function getPersonalTeamForUser(
  userId: string
): Promise<TeamDTO | null> {
  const res = await pool.query<TeamRow>(
    `SELECT t.id, t.name, t.is_personal, t.created_at
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = $1 AND t.is_personal = TRUE
     LIMIT 1`,
    [userId]
  );
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    name: row.name,
    is_personal: row.is_personal,
    created_at: row.created_at,
  };
}

/**
 * Check whether a user is a member of a team. Used by the API-keys route
 * to gate revoke actions.
 */
export async function userIsTeamMember(
  userId: string,
  teamId: string
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2 LIMIT 1`,
    [userId, teamId]
  );
  return (res.rowCount ?? 0) > 0;
}
