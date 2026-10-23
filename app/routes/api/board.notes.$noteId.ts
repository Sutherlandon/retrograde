// app/routes/api/board.notes.$noteId.ts
// PATCH  /api/v1/boards/:id/notes/:noteId — edit a note's text and/or move it
//        to another column (API-009; the browser's BRD-005 and BRD-007).
// DELETE /api/v1/boards/:id/notes/:noteId — delete a note (API-010; BRD-006).
// Participant-level, like the browser: board access and unlocked notes, no
// facilitation. Both answer with the board JSON.

import type { ActionFunctionArgs } from "react-router";
import {
  findNoteColumnOnBoard, columnIsOnBoard, updateNoteServer, deleteNoteServer,
} from "~/server/board_model";
import {
  apiError, requireApiBoardAccess, requireApiUnlocked, readJsonObject,
} from "~/server/api_board_guard";
import { tooLong } from "~/config/board_limits";

type NoteChanges = { text?: string; columnId?: string };

/** The body's changes, or the 400 that explains what's wrong with it. */
function parseChanges(body: Record<string, unknown>): NoteChanges | Response {
  const { text, columnId } = body;
  if (text === undefined && columnId === undefined) {
    return apiError("BAD_REQUEST", "Send `text`, `columnId`, or both", 400);
  }
  if (text !== undefined && (typeof text !== "string" || text.trim().length === 0)) {
    return apiError("BAD_REQUEST", "`text` must be a non-empty string", 400);
  }
  const over = tooLong("noteText", typeof text === "string" ? text : null);
  if (over) return apiError("BAD_REQUEST", over, 400);
  if (columnId !== undefined && (typeof columnId !== "string" || columnId.length === 0)) {
    return apiError("BAD_REQUEST", "`columnId` must be a column id", 400);
  }
  return { text: typeof text === "string" ? text.trim() : undefined, columnId: columnId as string | undefined };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const method = request.method.toUpperCase();
  if (method !== "PATCH" && method !== "DELETE") {
    return apiError("METHOD_NOT_ALLOWED", "Use PATCH or DELETE", 405);
  }
  const { id: boardId, noteId } = params;
  if (!boardId || !noteId) return apiError("BAD_REQUEST", "Missing board or note id", 400);

  const user = await requireApiBoardAccess(request, boardId);
  // BRD-005/006/007: either lock blocks editing, moving and deleting a note.
  await requireApiUnlocked(boardId, { notes: true });

  if (method === "DELETE") {
    const columnId = await findNoteColumnOnBoard(boardId, noteId);
    if (!columnId) return apiError("NOT_FOUND", "Note not found on this board", 404);
    return Response.json(await deleteNoteServer(boardId, columnId, noteId, user.id));
  }

  const changes = parseChanges(await readJsonObject(request));
  if (changes instanceof Response) return changes;

  if (!(await findNoteColumnOnBoard(boardId, noteId))) {
    return apiError("NOT_FOUND", "Note not found on this board", 404);
  }
  if (changes.columnId && !(await columnIsOnBoard(boardId, changes.columnId))) {
    return apiError("BAD_REQUEST", "`columnId` is not a column on this board", 400);
  }
  return Response.json(await updateNoteServer(boardId, noteId, changes, user.id));
}

export function loader() {
  return apiError("METHOD_NOT_ALLOWED", "Use PATCH or DELETE", 405);
}
