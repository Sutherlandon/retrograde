// app/routes/api/board.ts
// GET   /api/v1/boards/:id — JSON board state. Public read (matches existing
//       world-readable behavior of /app/board/:id). No auth required.
// PATCH /api/v1/boards/:id — rename the board (API-008). Same rule as BRD-003:
//       facilitators only, blocked by a board lock.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getBoardServer, updateBoardTitleServer } from "~/server/board_model";
import { getApiUser } from "~/hooks/useAuth";
import { getBoardAccess } from "~/server/board_permissions";
import {
  apiError, requireApiBoardAccess, requireApiFacilitator, requireApiUnlocked, readJsonObject,
} from "~/server/api_board_guard";

const MAX_TITLE_LENGTH = 200;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "Missing board id" } },
      { status: 400 }
    );
  }

  // Pull user context if provided so user_votes is populated correctly.
  // Public reads (no auth) still work on unrestricted boards; user_votes just
  // stays 0. Members-only crews gate access to members and matching API keys.
  const user = await getApiUser(request);
  const apiTeamId = (user as { teamId?: string } | null)?.teamId ?? null;
  const access = await getBoardAccess(id, user?.id ?? null, apiTeamId);

  if (!access.exists) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Board not found" } },
      { status: 404 }
    );
  }
  if (!access.allowed) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "This board is restricted to its crew" } },
      { status: 403 }
    );
  }

  const board = await getBoardServer(id, user?.id ?? null);
  if (!board) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Board not found" } },
      { status: 404 }
    );
  }

  return Response.json(board);
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "PATCH") return apiError("METHOD_NOT_ALLOWED", "Use PATCH", 405);
  const boardId = params.id;
  if (!boardId) return apiError("BAD_REQUEST", "Missing board id", 400);

  const user = await requireApiBoardAccess(request, boardId);
  await requireApiFacilitator(user, boardId);
  await requireApiUnlocked(boardId, { board: true });

  const body = await readJsonObject(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return apiError("BAD_REQUEST", "`title` is required", 400);
  if (title.length > MAX_TITLE_LENGTH) {
    return apiError("BAD_REQUEST", `\`title\` exceeds ${MAX_TITLE_LENGTH} chars`, 400);
  }

  const board = await updateBoardTitleServer(boardId, title, user.id);
  if (!board) return apiError("NOT_FOUND", "Board not found", 404);
  return Response.json(board);
}
