// app/routes/api/boards.ts
// POST /api/v1/boards — agent-facing JSON endpoint to create a board with
// custom columns and an agent identity. Returns a session-cookie value as
// `agent_token` so non-browser clients can use it as Authorization: Bearer.

import type { ActionFunctionArgs } from "react-router";
import { createBoardWithColumns } from "~/server/board_model";
import { createAgentUser, getApiUser } from "~/hooks/useAuth";
import { getSession, commitSession } from "~/session.server";
import { pool } from "~/server/db_config";
import { getPersonalTeamForUser } from "~/server/team_model";

type CreateBoardRequest = {
  title?: string;
  display_name?: string;
  columns?: { title: string; prompt?: string }[];
};

function bad(message: string, status = 400) {
  return Response.json({ error: { code: "BAD_REQUEST", message } }, { status });
}

/**
 * GAP-002: createBoardWithColumns now writes the owner row itself, iff it's
 * given a teamId — a crewless board must stay ownerless (ADR-0011). An
 * API-key caller already carries a teamId (ADR-0004). The edge case is a
 * caller authenticated via cookie session (getApiUser's legacy path never
 * sets teamId): if that's a registered human, attach their personal team so
 * the board ends up owned and on a crew per ADR-0003. An agent or anonymous
 * session gets neither — agents don't have personal teams.
 */
async function resolveTeamIdForAuthedUser(
  userId: string,
  existingTeamId: string | null
): Promise<string | null> {
  if (existingTeamId) return existingTeamId;

  const userRes = await pool.query<{ is_agent: boolean; is_anonymous: boolean }>(
    `SELECT is_agent, is_anonymous FROM users WHERE id = $1`,
    [userId]
  );
  const user = userRes.rows[0];
  if (!user || user.is_agent || user.is_anonymous) return null;

  const personalTeam = await getPersonalTeamForUser(userId);
  return personalTeam?.id ?? null;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } },
      { status: 405 }
    );
  }

  let body: CreateBoardRequest;
  try {
    body = (await request.json()) as CreateBoardRequest;
  } catch {
    return bad("Body must be valid JSON");
  }

  const title = body.title?.trim();
  if (!title || title.length < 1) {
    return bad("`title` is required");
  }
  if (title.length > 200) {
    return bad("`title` exceeds 200 chars");
  }

  const displayName = body.display_name?.trim() || "Agent";
  if (displayName.length > 100) {
    return bad("`display_name` exceeds 100 chars");
  }

  const columns = body.columns ?? [];
  if (!Array.isArray(columns)) {
    return bad("`columns` must be an array");
  }
  if (columns.length > 20) {
    return bad("Too many columns (max 20)");
  }
  for (const c of columns) {
    if (!c || typeof c.title !== "string" || c.title.trim().length === 0) {
      return bad("Each column needs a non-empty `title`");
    }
    if (c.title.length > 100) {
      return bad("Column title exceeds 100 chars");
    }
  }

  // If the caller is authenticated (real API key or logged-in browser), use
  // their identity + team. Otherwise fall through to the legacy trial flow:
  // mint an anonymous agent user, return an agent_token, leave the board
  // teamless. See ADR-0004 and ADR-0005.
  const authedUser = await getApiUser(request);
  const url = new URL(request.url);

  if (authedUser) {
    const teamId = await resolveTeamIdForAuthedUser(
      authedUser.id,
      (authedUser as { teamId?: string }).teamId ?? null
    );
    const boardId = await createBoardWithColumns(title, columns, authedUser.id, teamId);
    return Response.json(
      {
        board_id: boardId,
        board_url: `${url.protocol}//${url.host}/app/board/${boardId}`,
        team_id: teamId,
      },
      { status: 201 }
    );
  }

  // Trial flow — anonymous agent + teamless board + legacy agent_token.
  // GAP-002: crewless boards are ownerless (createBoardWithColumns writes no
  // owner row when teamId is null) — that's what makes the board claimable.
  const agentUserId = await createAgentUser(null, displayName);
  const boardId = await createBoardWithColumns(title, columns, agentUserId, null);

  const session = await getSession();
  session.set("userId", agentUserId);
  const cookieHeader = await commitSession(session);
  const tokenValue = cookieHeader.split(";")[0].split("=").slice(1).join("=");

  return Response.json(
    {
      board_id: boardId,
      board_url: `${url.protocol}//${url.host}/app/board/${boardId}`,
      agent_token: tokenValue,
    },
    {
      status: 201,
      headers: { "Set-Cookie": cookieHeader },
    }
  );
}

export function loader() {
  return Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } },
    { status: 405 }
  );
}
