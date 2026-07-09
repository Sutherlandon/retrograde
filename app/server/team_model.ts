// app/server/team_model.ts
// Team and team-membership CRUD. See ADR-0003.

import { pool } from "./db_config";
import type { TeamDTO, TeamMemberDTO } from "./board.types";

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

/** The caller's role on a team, or null when not a member. */
export async function teamRole(
  teamId: string,
  userId: string
): Promise<string | null> {
  const res = await pool.query<{ role: string }>(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );
  if (res.rowCount === 0) return null;
  return res.rows[0].role;
}

// ---------------------------------------------------------------------------
// Multi-member teams (issue #72)
// ---------------------------------------------------------------------------

export async function createTeam(name: string, userId: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const teamRes = await client.query<{ id: string }>(
      `INSERT INTO teams (name, is_personal) VALUES ($1, FALSE) RETURNING id`,
      [name]
    );
    const teamId = teamRes.rows[0].id;
    await client.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`,
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

export interface TeamSummary extends TeamDTO {
  role: string;
  member_count: number;
  board_count: number;
  open_action_items: number;
}

export async function listTeamsForUser(userId: string): Promise<TeamSummary[]> {
  const res = await pool.query(
    `SELECT t.id, t.name, t.is_personal, t.created_at, tm.role,
       (SELECT COUNT(*)::int FROM team_members m WHERE m.team_id = t.id) AS member_count,
       (SELECT COUNT(*)::int FROM boards b WHERE b.team_id = t.id AND b.archived_at IS NULL) AS board_count,
       (SELECT COUNT(*)::int FROM action_items ai
         WHERE NOT ai.completed
           AND (ai.team_id = t.id
                OR ai.board_id IN (SELECT b2.id FROM boards b2 WHERE b2.team_id = t.id))
       ) AS open_action_items
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1
     ORDER BY t.is_personal DESC, t.created_at ASC`,
    [userId]
  );
  return res.rows as TeamSummary[];
}

export async function getTeamWithMembers(teamId: string): Promise<{
  team: TeamDTO;
  members: TeamMemberDTO[];
} | null> {
  const teamRes = await pool.query<TeamRow>(
    `SELECT id, name, is_personal, created_at FROM teams WHERE id = $1`,
    [teamId]
  );
  if (teamRes.rowCount === 0) return null;

  const memberRes = await pool.query(
    `SELECT tm.user_id, tm.role, tm.created_at,
            COALESCE(u.display_name, u.preferred_username, 'Guest') AS username
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY (tm.role = 'owner') DESC, tm.created_at ASC`,
    [teamId]
  );

  const t = teamRes.rows[0];
  return {
    team: { id: t.id, name: t.name, is_personal: t.is_personal, created_at: t.created_at },
    members: memberRes.rows as TeamMemberDTO[],
  };
}

export async function addTeamMember(teamId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [teamId, userId]
  );
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  // Owners cannot be removed through this path.
  await pool.query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 AND role <> 'owner'`,
    [teamId, userId]
  );
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  // Personal teams keep their generated name.
  await pool.query(
    `UPDATE teams SET name = $1 WHERE id = $2 AND is_personal = FALSE`,
    [name, teamId]
  );
}

export async function deleteTeamServer(teamId: string): Promise<void> {
  // Personal teams are permanent. Boards keep existing (team_id → NULL via FK);
  // team-level action items cascade with the team.
  await pool.query(
    `DELETE FROM teams WHERE id = $1 AND is_personal = FALSE`,
    [teamId]
  );
}

export interface TeamBoardRow {
  id: string;
  title: string;
  created_at: string;
  open_action_items: number;
}

export async function listTeamBoards(teamId: string): Promise<TeamBoardRow[]> {
  const res = await pool.query(
    `SELECT b.id, b.title, b.created_at,
       (SELECT COUNT(*)::int FROM action_items ai
         WHERE ai.board_id = b.id AND NOT ai.completed) AS open_action_items
     FROM boards b
     WHERE b.team_id = $1 AND b.archived_at IS NULL
     ORDER BY b.created_at DESC`,
    [teamId]
  );
  return res.rows as TeamBoardRow[];
}
