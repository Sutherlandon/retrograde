import { redirect } from "react-router";
import { getSession } from "~/session.server";
import { pool } from "~/server/db_config";
import { siteConfig } from "~/config/siteConfig";
import { isApiKey, findApiKeyByValue, touchApiKeyLastUsed } from "~/server/api_key";

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

  return { id, username, is_anonymous: Boolean(user.is_anonymous) };
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

export async function createAgentUser(
  boardId: string | null,
  displayName: string
): Promise<string> {
  const externalId = `agent-${crypto.randomUUID()}`;
  const result = await pool.query(
    `INSERT INTO users (external_id, is_anonymous, is_agent, preferred_username, display_name, board_id)
     VALUES ($1, TRUE, TRUE, 'Agent', $2, $3)
     RETURNING id`,
    [externalId, displayName, boardId]
  );
  return result.rows[0].id;
}

/**
 * Resolve the calling user from EITHER an Authorization: Bearer <token> header
 * OR a session cookie. Bearer wins. Returns null if neither yields a known user.
 *
 * Two bearer-token formats are supported:
 *   1. rk_live_<...>  — a real API key (ADR-0004). Resolves to the agent user
 *      seated by the key; includes `teamId` so route handlers can attach
 *      created boards to the right team (ADR-0003).
 *   2. anything else — treated as a legacy session-cookie value. Backward
 *      compat for agent_tokens returned by the original POST /api/v1/boards
 *      flow (which predates real API keys).
 */
export async function getApiUser(request: Request) {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();

    if (isApiKey(token)) {
      const apiKey = await findApiKeyByValue(token);
      if (apiKey && apiKey.agent_user_id) {
        // Fire-and-forget; failure here doesn't block the caller.
        touchApiKeyLastUsed(apiKey.id).catch(() => { /* swallow */ });
        const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [apiKey.agent_user_id]);
        const user = userRows.rows[0];
        if (user) {
          return {
            id: user.id,
            username: user.display_name || user[siteConfig.usernameField] || "Agent",
            teamId: apiKey.team_id,
          };
        }
      }
      // API-key-shaped token that didn't resolve: don't fall through to cookie
      // auth — the caller intended bearer auth and it failed.
      return null;
    }

    // Legacy bearer-as-session-cookie path.
    const session = await getSession(`__session=${token}`);
    const userId = session.get("userId");
    if (userId) {
      const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
      const user = userRows.rows[0];
      if (user) {
        return { id: user.id, username: user[siteConfig.usernameField] || user.display_name || "Guest" };
      }
    }
  }
  // Fall back to cookie-based auth
  return getOptionalUser(request);
}

export async function getOrCreateUser(request: Request, boardId: string) {
  const session = await getSession(request.headers.get("Cookie"));
  let userId = session.get("userId");

  if (userId) {
    const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (userRows.rows[0]) {
      const user = userRows.rows[0];
      return {
        user: {
          id: user.id,
          username: user[siteConfig.usernameField] || "Guest",
          is_anonymous: Boolean(user.is_anonymous),
        },
        session,
        isNew: false,
      };
    }
  }

  // No valid session — create anonymous user linked to this board
  userId = await createAnonymousUser(boardId);
  session.set("userId", userId);
  return {
    user: { id: userId, username: "Guest", is_anonymous: true },
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

  return { id, username, is_anonymous: false };
}
