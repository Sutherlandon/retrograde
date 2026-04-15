// routes/app/board.notes.ts
// Resource route — no UI. Handles all note mutations for a board.
// PATCH  → upsert note (create-or-update) OR move note (via intent field)
// DELETE → delete note

import { type ActionFunctionArgs } from "react-router";
import { getOptionalUser } from "~/hooks/useAuth";
import {
  upsertNoteServer,
  likeNoteServer,
  voteNoteServer,
  deleteNoteServer,
  moveNoteServer,
  reorderNotesServer,
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

      if (intent === "reorder") {
        const toColumnId = data.get("toColumnId") as string;
        const orderedNoteIdsJson = data.get("orderedNoteIds") as string;
        if (!toColumnId || !orderedNoteIdsJson) {
          throw new Response("Missing reorder fields", { status: 422 });
        }
        const orderedNoteIds: string[] = JSON.parse(orderedNoteIdsJson);
        return reorderNotesServer(boardId, toColumnId, orderedNoteIds);
      }

      if (intent === "like") {
        const noteId = data.get("noteId") as string;
        const delta = Number(data.get("delta"));
        if (!noteId || isNaN(delta)) {
          throw new Response("Missing like fields", { status: 422 });
        }
        const likeUser = await getOptionalUser(request);
        return likeNoteServer(boardId, noteId, delta, likeUser?.id);
      }

      if (intent === "vote") {
        const noteId = data.get("noteId") as string;
        const delta = Number(data.get("delta"));
        if (!noteId || isNaN(delta) || delta === 0) throw new Response("Missing vote fields", { status: 422 });
        const user = await getOptionalUser(request);
        if (!user) throw new Response("Unauthorized", { status: 401 });
        return voteNoteServer(boardId, noteId, user.id, delta);
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
      const noteUser = await getOptionalUser(request);
      return upsertNoteServer(boardId, noteId, columnId, newText, likes, created, noteUser?.id);
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