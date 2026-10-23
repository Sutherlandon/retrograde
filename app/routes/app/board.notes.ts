// routes/app/board.notes.ts
// Resource route — no UI. Handles all note mutations for a board.
// PATCH  → upsert note (create-or-update) OR move note (via intent field)
// DELETE → delete note

import { type ActionFunctionArgs } from "react-router";
import { requireBoardAccess, requireUnlocked } from "~/server/board_permissions";
import { tooLong } from "~/config/board_limits";
import { logMetric } from "~/server/logger";
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

  // The caller requireBoardAccess resolves (API key, agent_token or session)
  // is the actor for every write below, so an agent's note is attributed to
  // its agent whichever surface it arrives on (ADR-0002).
  const user = await requireBoardAccess(request, boardId);

  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "PATCH": {
      const intent = data.get("intent") as string;

      if (intent === "move") {
        // BRD-007: dragging a note is blocked by either lock (Note.tsx disables
        // the sortable when notesLocked || boardLocked).
        await requireUnlocked(boardId, { notes: true });

        const noteId = data.get("noteId") as string;
        const fromColumnId = data.get("fromColumnId") as string;
        const toColumnId = data.get("toColumnId") as string;
        if (!noteId || !fromColumnId || !toColumnId) {
          throw new Response("Missing move fields", { status: 422 });
        }
        return moveNoteServer(boardId, fromColumnId, toColumnId, noteId, user?.id);
      }

      if (intent === "reorder") {
        // BRD-008: same drag lock as move.
        await requireUnlocked(boardId, { notes: true });

        const toColumnId = data.get("toColumnId") as string;
        const orderedNoteIdsJson = data.get("orderedNoteIds") as string;
        if (!toColumnId || !orderedNoteIdsJson) {
          throw new Response("Missing reorder fields", { status: 422 });
        }
        const orderedNoteIds: string[] = JSON.parse(orderedNoteIdsJson);
        return reorderNotesServer(boardId, toColumnId, orderedNoteIds, user?.id);
      }

      if (intent === "like") {
        // BRD-009: Note.tsx only disables likes/votes when boardLocked, not
        // notesLocked — the like/vote row keeps working while notes are locked.
        await requireUnlocked(boardId, { board: true });

        const noteId = data.get("noteId") as string;
        const delta = Number(data.get("delta"));
        if (!noteId || isNaN(delta)) {
          throw new Response("Missing like fields", { status: 422 });
        }
        return likeNoteServer(boardId, noteId, delta, user?.id);
      }

      if (intent === "vote") {
        // BRD-010: same as like — boardLocked only.
        await requireUnlocked(boardId, { board: true });

        const noteId = data.get("noteId") as string;
        const delta = Number(data.get("delta"));
        if (!noteId || isNaN(delta) || delta === 0) throw new Response("Missing vote fields", { status: 422 });
        if (!user) throw new Response("Unauthorized", { status: 401 });
        logMetric("Vote Note", { userId: user.id, boardId, noteId, delta });
        return voteNoteServer(boardId, noteId, user.id, delta);
      }

      // default PATCH: update note content (BRD-004/BRD-005 — add/edit)
      await requireUnlocked(boardId, { notes: true });

      const noteId = data.get("noteId") as string;
      const columnId = data.get("columnId") as string;
      const newText = data.get("text") as string;
      const likes = Number(data.get("likes"));
      const created = data.get("created") as string;
      if (!noteId || !columnId || newText == null || isNaN(likes) || !created) {
        throw new Response("Missing note update fields", { status: 422 });
      }
      const over = tooLong("noteText", newText);
      if (over) throw new Response(over, { status: 422 });
      return upsertNoteServer(boardId, noteId, columnId, newText, likes, created, user?.id);
    }

    case "DELETE": {
      // BRD-006: deleting a note is blocked by either lock.
      await requireUnlocked(boardId, { notes: true });

      const noteId = data.get("noteId") as string;
      const columnId = data.get("columnId") as string;
      if (!noteId || !columnId) throw new Response("Missing noteId or columnId", { status: 422 });
      logMetric("Delete Note", { userId: user?.id, boardId, noteId });
      return deleteNoteServer(boardId, columnId, noteId, user?.id);
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}