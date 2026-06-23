// app/routes/api/board.notes.ts
// POST /api/v1/boards/:id/notes — bulk add notes. Authenticated by
// Authorization: Bearer <agent_token> OR by session cookie.

import type { ActionFunctionArgs } from "react-router";
import { bulkInsertNotesServer } from "~/server/board_model";
import { getApiUser } from "~/hooks/useAuth";

const MAX_NOTES_PER_REQUEST = 200;
const MAX_NOTE_LENGTH = 2000;

type BulkNotesRequest = {
  notes?: { columnId: string; text: string }[];
};

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return err("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  const boardId = params.id;
  if (!boardId) {
    return err("BAD_REQUEST", "Missing board id", 400);
  }

  const user = await getApiUser(request);
  if (!user) {
    return err(
      "UNAUTHORIZED",
      "Authorization: Bearer <agent_token> required",
      401
    );
  }

  let body: BulkNotesRequest;
  try {
    body = (await request.json()) as BulkNotesRequest;
  } catch {
    return err("BAD_REQUEST", "Body must be valid JSON", 400);
  }

  const notes = body.notes;
  if (!Array.isArray(notes)) {
    return err("BAD_REQUEST", "`notes` must be an array", 400);
  }
  if (notes.length === 0) {
    return err("BAD_REQUEST", "`notes` cannot be empty", 400);
  }
  if (notes.length > MAX_NOTES_PER_REQUEST) {
    return err(
      "PAYLOAD_TOO_LARGE",
      `Too many notes; max ${MAX_NOTES_PER_REQUEST} per request`,
      413
    );
  }

  for (const n of notes) {
    if (!n || typeof n.columnId !== "string" || typeof n.text !== "string") {
      return err("BAD_REQUEST", "Each note needs `columnId` and `text`", 400);
    }
    if (n.text.trim().length === 0) {
      return err("BAD_REQUEST", "Note `text` cannot be empty", 400);
    }
    if (n.text.length > MAX_NOTE_LENGTH) {
      return err("BAD_REQUEST", `Note text exceeds ${MAX_NOTE_LENGTH} chars`, 400);
    }
  }

  try {
    const board = await bulkInsertNotesServer(boardId, notes, user.id);
    if (!board) {
      return err("NOT_FOUND", "Board not found", 404);
    }
    return Response.json(board, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("COLUMN_NOT_ON_BOARD:")) {
      const badIds = msg.slice("COLUMN_NOT_ON_BOARD:".length);
      return err(
        "BAD_REQUEST",
        `One or more columnIds do not belong to this board: ${badIds}`,
        400
      );
    }
    throw e;
  }
}

export function loader() {
  return err("METHOD_NOT_ALLOWED", "Use POST", 405);
}
