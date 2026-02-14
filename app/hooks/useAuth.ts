import { redirect } from "react-router";
import { getSession } from "~/session.server";
import { pool } from "~/server/db_config";

export async function requireUser(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  const pathname = new URL(request.url).pathname;

  if (!userId) {
    throw redirect("/auth/login?returnTo=" + encodeURIComponent(pathname));
  }

  // Fetch user from database if needed, e.g.:
  const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  const user = userRows.rows[0];
  const { id, preferred_username: username } = user;

  return { id, username };
}
