// app/server/admin_model.ts
// Database operations for admin user management.
// "Site admins" are set via SITE_ADMIN_IDS in the environment and always have
// access. "Granted admins" are stored in the admin_users table and can be
// added or removed by site admins through the UI.

import { pool } from "./db_config";

export interface GrantedAdmin {
  id: string;
  userId: string;
  username: string;
  grantedBy: string;
  createdAt: string;
}

export async function isGrantedAdmin(userId: string): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM admin_users WHERE user_id = $1",
    [userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listGrantedAdmins(): Promise<GrantedAdmin[]> {
  const result = await pool.query(`
    SELECT
      au.id,
      au.user_id                                                            AS "userId",
      u.preferred_username                                                  AS username,
      au.granted_by                                                         AS "grantedBy",
      to_char(au.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
    FROM admin_users au
    JOIN users u ON u.id = au.user_id
    ORDER BY au.created_at ASC
  `);
  return result.rows;
}

export async function findRegisteredUserByUsername(
  username: string
): Promise<{ id: string; username: string } | null> {
  const result = await pool.query(
    `SELECT id, preferred_username AS username
     FROM users
     WHERE preferred_username = $1 AND is_anonymous = FALSE`,
    [username]
  );
  return result.rows[0] ?? null;
}

export async function addGrantedAdmin(
  userId: string,
  grantedByExternalId: string
): Promise<void> {
  await pool.query(
    `INSERT INTO admin_users (user_id, granted_by)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, grantedByExternalId]
  );
}

export async function removeGrantedAdmin(userId: string): Promise<void> {
  await pool.query("DELETE FROM admin_users WHERE user_id = $1", [userId]);
}
