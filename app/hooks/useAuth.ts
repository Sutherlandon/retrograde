import { redirect } from "react-router";
import { getSession } from "~/session.server";
import { pool, oauthUsernameField, selfHosted } from "~/server/db_config";
import { isApiKey, findApiKeyByValue, touchApiKeyLastUsed } from "~/server/api_key";
import { isExampleBoardId } from "~/example-data/example_board_ids";

// Marketing pages a self-hosted instance does not serve (ADR-0017). Signing in
// from one of them lands on the dashboard instead.
const MARKETING_PATHS = new Set(["/", "/about", "/contact", "/terms-of-service", "/privacy-policy"]);

/**
 * Where to bring someone back to after sign-in: the page behind a background
 * data request rather than its `.data` URL, and the dashboard in place of a
 * marketing page.
 */
function returnPathAfterSignIn(url: URL): string {
  let pathname = url.pathname;
  if (pathname === "/_root.data") pathname = "/";
  else if (pathname.endsWith(".data")) pathname = pathname.slice(0, -".data".length);
  if (MARKETING_PATHS.has(pathname)) return "/app/dashboard";

  const params = new URLSearchParams(url.search);
  params.delete("_routes");
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * A self-hosted instance has no guests (ADR-0021). Every identity resolver
 * below throws this for a caller without a signed-in account: the JSON API
 * answers 401, and everything else is sent to sign in.
 */
function signInRequired(request: Request): Response {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in, or send an API key as Authorization: Bearer" } },
      { status: 401 }
    );
  }
  return redirect(`/auth/login?returnTo=${encodeURIComponent(returnPathAfterSignIn(url))}`);
}

async function findUser(userId: string) {
  const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
  return userRows.rows[0];
}

export async function getOptionalUser(request: Request) {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  const user = userId ? await findUser(userId) : undefined;

  // An anonymous session left over from before an upgrade counts as signed out.
  if (selfHosted && (!user || user.is_anonymous)) throw signInRequired(request);
  if (!user) return null;

  return { id: user.id, username: user[oauthUsernameField], is_anonymous: Boolean(user.is_anonymous) };
}

export async function createAnonymousUser(boardId: string | null): Promise<string> {
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
 * OR a session cookie. Bearer wins. Returns null if neither yields a known user
 * — except on a self-hosted instance, which throws instead (ADR-0021).
 *
 * Two bearer-token formats are supported:
 *   1. rk_live_<...>  — a real API key (ADR-0004). Resolves to the agent user
 *      seated by the key; includes `teamId` so route handlers can attach
 *      created boards to the right team (ADR-0003). A key is minted by a
 *      signed-in crew owner, so it is accepted on a self-hosted instance too.
 *   2. anything else — treated as a legacy session-cookie value. Backward
 *      compat for agent_tokens returned by the original POST /api/v1/boards
 *      flow (which predates real API keys). Those belong to anonymous trial
 *      agents, which a self-hosted instance does not accept.
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
        const user = await findUser(apiKey.agent_user_id);
        if (user) {
          return {
            id: user.id,
            username: user.display_name || user[oauthUsernameField] || "Agent",
            teamId: apiKey.team_id,
          };
        }
      }
      // API-key-shaped token that didn't resolve: don't fall through to cookie
      // auth — the caller intended bearer auth and it failed.
      if (selfHosted) throw signInRequired(request);
      return null;
    }

    // Legacy bearer-as-session-cookie path.
    const session = await getSession(`__session=${token}`);
    const userId = session.get("userId");
    if (userId) {
      const user = await findUser(userId);
      if (user && !(selfHosted && user.is_anonymous)) {
        return { id: user.id, username: user[oauthUsernameField] || user.display_name || "Guest" };
      }
    }
    if (selfHosted) throw signInRequired(request);
  }
  // Fall back to cookie-based auth
  return getOptionalUser(request);
}

export async function getOrCreateUser(request: Request, boardId: string) {
  const session = await getSession(request.headers.get("Cookie"));
  let userId = session.get("userId");

  if (userId) {
    const user = await findUser(userId);
    if (user && !(selfHosted && user.is_anonymous)) {
      return {
        user: {
          id: user.id,
          username: user[oauthUsernameField] || "Guest",
          is_anonymous: Boolean(user.is_anonymous),
        },
        session,
        isNew: false,
      };
    }
  }

  // A self-hosted instance has no guests (ADR-0021): send the visitor to sign
  // in rather than creating one.
  if (selfHosted) throw signInRequired(request);

  // No valid session — create anonymous user linked to this board. Example
  // boards (BRD-017) are static fixtures with no matching `boards` row, so
  // linking would violate users.board_id's FK — pass null instead.
  userId = await createAnonymousUser(isExampleBoardId(boardId) ? null : boardId);
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

  const user = await findUser(userId);

  if (!user || user.is_anonymous) {
    throw redirect("/auth/login?returnTo=" + encodeURIComponent(pathname));
  }

  const { id, preferred_username: username } = user;

  return { id, username, is_anonymous: false };
}
