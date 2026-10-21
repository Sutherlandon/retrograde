// app/routes/api/board.columns.$columnId.ts
// PATCH  /api/v1/boards/:id/columns/:columnId — rename a column (API-012,
//        participant-level like BRD-011) and/or set its prompt (API-013,
//        facilitators only like BRD-012).
// DELETE /api/v1/boards/:id/columns/:columnId — delete a column and its notes
//        (API-014; facilitators only like BRD-013).
// Each field carries its browser counterpart's lock rule. Both answer with
// the board JSON.

import type { ActionFunctionArgs } from "react-router";
import { columnIsOnBoard, updateColumnServer, deleteColumnServer } from "~/server/board_model";
import {
  apiError, requireApiBoardAccess, requireApiFacilitator, requireApiUnlocked, readJsonObject,
} from "~/server/api_board_guard";
import { tooLong } from "~/config/board_limits";

type ColumnChanges = { title?: string; prompt?: string };

/** The body's changes, or the 400 that explains what's wrong with it. */
function parseChanges(body: Record<string, unknown>): ColumnChanges | Response {
  const { title, prompt } = body;
  if (title === undefined && prompt === undefined) {
    return apiError("BAD_REQUEST", "Send `title`, `prompt`, or both", 400);
  }
  if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) {
    return apiError("BAD_REQUEST", "`title` must be a non-empty string", 400);
  }
  if (prompt !== undefined && typeof prompt !== "string") {
    return apiError("BAD_REQUEST", "`prompt` must be a string", 400);
  }
  const over = tooLong("columnTitle", typeof title === "string" ? title.trim() : null) ?? tooLong("columnPrompt", prompt as string | undefined);
  if (over) return apiError("BAD_REQUEST", over, 400);
  return { title: typeof title === "string" ? title.trim() : undefined, prompt: prompt as string | undefined };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const method = request.method.toUpperCase();
  if (method !== "PATCH" && method !== "DELETE") {
    return apiError("METHOD_NOT_ALLOWED", "Use PATCH or DELETE", 405);
  }
  const { id: boardId, columnId } = params;
  if (!boardId || !columnId) return apiError("BAD_REQUEST", "Missing board or column id", 400);

  const user = await requireApiBoardAccess(request, boardId);

  if (method === "DELETE") {
    await requireApiFacilitator(user, boardId);
    await requireApiUnlocked(boardId, { board: true });
    if (!(await columnIsOnBoard(boardId, columnId))) {
      return apiError("NOT_FOUND", "Column not found on this board", 404);
    }
    return Response.json(await deleteColumnServer(boardId, columnId, user.id));
  }

  const changes = parseChanges(await readJsonObject(request));
  if (changes instanceof Response) return changes;

  const settingPrompt = changes.prompt !== undefined;
  if (settingPrompt) await requireApiFacilitator(user, boardId);
  // A title is blocked by either lock (BRD-011); a prompt only by the board lock (BRD-012).
  await requireApiUnlocked(boardId, { notes: changes.title !== undefined, board: settingPrompt });

  if (!(await columnIsOnBoard(boardId, columnId))) {
    return apiError("NOT_FOUND", "Column not found on this board", 404);
  }
  return Response.json(await updateColumnServer(boardId, columnId, changes, user.id));
}

export function loader() {
  return apiError("METHOD_NOT_ALLOWED", "Use PATCH or DELETE", 405);
}
