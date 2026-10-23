// app/server/api_board_guard.ts
// Guards for the agent-facing JSON API's board writes (ADR-0001, ADR-0027).
// The same three checks the browser routes compose — board access, then
// facilitation, then locks — but resolving the caller with getApiUser (API
// key, agent_token or session) and failing as `{ error: { code, message } }`
// JSON. Each guard throws its error Response; a resource route returns a
// thrown Response as-is.

import { getApiUser } from "~/hooks/useAuth";
import { getBoardAccess, userCanFacilitate, lockReason } from "./board_permissions";

export function apiError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

export interface ApiCaller {
  id: string;
  username: string;
  teamId?: string;
}

/**
 * The caller, if they may touch this board at all: 401 without credentials,
 * 404 for a missing board, 403 when a members-only board's crew doesn't
 * include them (an API key counts for its own crew). Check this before
 * facilitation — open_facilitation would otherwise admit an outsider (GAP-008).
 */
export async function requireApiBoardAccess(request: Request, boardId: string): Promise<ApiCaller> {
  const user: ApiCaller | null = await getApiUser(request);
  if (!user) {
    throw apiError("UNAUTHORIZED", "Authorization: Bearer <api key or agent_token> required", 401);
  }
  const access = await getBoardAccess(boardId, user.id, user.teamId ?? null);
  if (!access.exists) throw apiError("NOT_FOUND", "Board not found", 404);
  if (!access.allowed) throw apiError("FORBIDDEN", "This board is restricted to its crew", 403);
  return user;
}

/** 403 unless the caller can facilitate the board (userCanFacilitate). */
export async function requireApiFacilitator(user: Pick<ApiCaller, "id">, boardId: string): Promise<void> {
  if (!(await userCanFacilitate(user.id, boardId))) {
    throw apiError("FORBIDDEN", "Caller cannot facilitate this board", 403);
  }
}

/** 423 when a lock blocks this write — the flags mean what they do for lockReason. */
export async function requireApiUnlocked(
  boardId: string,
  flags: { notes?: boolean; board?: boolean }
): Promise<void> {
  const locked = await lockReason(boardId, flags);
  if (locked) throw apiError("LOCKED", locked, 423);
}

/** The request body, which must be a JSON object; 400 otherwise. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw apiError("BAD_REQUEST", "Body must be valid JSON", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw apiError("BAD_REQUEST", "Body must be a JSON object", 400);
  }
  return body as Record<string, unknown>;
}
