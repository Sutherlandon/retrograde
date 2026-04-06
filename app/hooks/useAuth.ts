import { redirect } from "react-router";
import { getSession } from "~/session.server";
import { pool } from "~/server/db_config";
import { siteConfig } from "~/config/siteConfig";

export async function getOptionalUser(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");

  if (!userId) {
    return null;
  }

  const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  const user = userRows.rows[0];

  if (!user) {
    return null;
  }

  const id = user.id;
  const username = user[siteConfig.usernameField];

  return { id, username };
}

export async function createAnonymousUser(boardId: string): Promise<string> {
  const externalId = `anon-${crypto.randomUUID()}`;
  const result = await pool.query(
    `INSERT INTO users (external_id, is_anonymous, preferred_username, board_id)
     VALUES ($1, TRUE, 'Guest', $2)
     RETURNING id`,
    [externalId, boardId]
  );
  return result.rows[0].id;
}

export async function getOrCreateUser(request: Request, boardId: string) {
  const session = await getSession(request.headers.get("Cookie"));
  let userId = session.get("userId");

  if (userId) {
    const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (userRows.rows[0]) {
      const user = userRows.rows[0];
      return {
        user: { id: user.id, username: user[siteConfig.usernameField] || "Guest" },
        session,
        isNew: false,
      };
    }
  }

  // No valid session — create anonymous user linked to this board
  userId = await createAnonymousUser(boardId);
  session.set("userId", userId);
  return {
    user: { id: userId, username: "Guest" },
    session,
    isNew: true,
  };
}

export async function requireRegisteredUser(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  const pathname = new URL(request.url).pathname;

  if (!userId) {
    throw redirect("/auth/login?returnTo=" + encodeURIComponent(pathname));
  }

  const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  const user = userRows.rows[0];

  if (!user || user.is_anonymous) {
    throw redirect("/auth/login?returnTo=" + encodeURIComponent(pathname));
  }

  const { id, preferred_username: username } = user;

  return { id, username };
}
