// routes/app/board.notes.ts
// Resource route — no UI. Handles all note mutations for a board.
// PATCH  → upsert note (create-or-update) OR move note (via intent field)
// DELETE → delete note

import { type ActionFunctionArgs } from "react-router";
import {
  upsertNoteServer,
  likeNoteServer,
  deleteNoteServer,
  moveNoteServer,
} from "~/server/board_model";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "PATCH": {
      const intent = data.get("intent") as string;

      if (intent === "move") {
        const noteId = data.get("noteId") as string;
        const fromColumnId = data.get("fromColumnId") as string;
        const toColumnId = data.get("toColumnId") as string;
        if (!noteId || !fromColumnId || !toColumnId) {
          throw new Response("Missing move fields", { status: 422 });
        }
        return moveNoteServer(boardId, fromColumnId, toColumnId, noteId);
      }

      if (intent === "like") {
        const noteId = data.get("noteId") as string;
        const delta = Number(data.get("delta"));
        if (!noteId || isNaN(delta)) {
          throw new Response("Missing like fields", { status: 422 });
        }
        return likeNoteServer(boardId, noteId, delta);
      }

      // default PATCH: update note content
      const noteId = data.get("noteId") as string;
      const columnId = data.get("columnId") as string;
      const newText = data.get("text") as string;
      const likes = Number(data.get("likes"));
      const created = data.get("created") as string;
      if (!noteId || !columnId || newText == null || isNaN(likes) || !created) {
        throw new Response("Missing note update fields", { status: 422 });
      }
      return upsertNoteServer(boardId, noteId, columnId, newText, likes, created);
    }

    case "DELETE": {
      const noteId = data.get("noteId") as string;
      const columnId = data.get("columnId") as string;
      if (!noteId || !columnId) throw new Response("Missing noteId or columnId", { status: 422 });
      return deleteNoteServer(boardId, columnId, noteId);
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}