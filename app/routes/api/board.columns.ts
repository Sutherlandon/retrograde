// app/routes/api/board.columns.ts
// POST /api/v1/boards/:id/columns — add a column after the last one (API-011;
// the browser's DECK-006). Facilitators only, blocked by a board lock.
// Answers 201 with the board JSON; Location names the new column.

import type { ActionFunctionArgs } from "react-router";
import { appendColumnServer } from "~/server/board_model";
import {
  apiError, requireApiBoardAccess, requireApiFacilitator, requireApiUnlocked, readJsonObject,
} from "~/server/api_board_guard";
import { tooLong } from "~/config/board_limits";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return apiError("METHOD_NOT_ALLOWED", "Use POST", 405);
  const boardId = params.id;
  if (!boardId) return apiError("BAD_REQUEST", "Missing board id", 400);

  const user = await requireApiBoardAccess(request, boardId);
  await requireApiFacilitator(user, boardId);
  await requireApiUnlocked(boardId, { board: true });

  const body = await readJsonObject(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return apiError("BAD_REQUEST", "`title` is required", 400);
  const prompt = body.prompt ?? "";
  if (typeof prompt !== "string") return apiError("BAD_REQUEST", "`prompt` must be a string", 400);
  const over = tooLong("columnTitle", title) ?? tooLong("columnPrompt", prompt);
  if (over) return apiError("BAD_REQUEST", over, 400);

  const { columnId, board } = await appendColumnServer(boardId, title, prompt, user.id);
  if (!board) return apiError("NOT_FOUND", "Board not found", 404);
  return Response.json(board, {
    status: 201,
    headers: { Location: `/api/v1/boards/${boardId}/columns/${columnId}` },
  });
}

export function loader() {
  return apiError("METHOD_NOT_ALLOWED", "Use POST", 405);
}
