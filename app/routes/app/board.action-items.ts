// routes/app/board.action-items.ts
// Resource route — no UI. Board-level action item mutations (issue #88).
// POST   → create (facilitators)
// PATCH  → intent=text: edit text (facilitators)
//          intent=complete: toggle completion (any session user)
// DELETE → delete (facilitators)
// All mutations return the refreshed BoardDTO for BoardContext sync.

import { type ActionFunctionArgs } from "react-router";
import {
  createBoardActionItem,
  updateActionItemText,
  setActionItemCompleted,
  deleteActionItemServer,
} from "~/server/action_item_model";
import { requireBoardAccess, requireFacilitator, requireUnlocked } from "~/server/board_permissions";
import { tooLong } from "~/config/board_limits";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  // BRD-014, DECK-023–025: board access first, as on every other board write
  // and as the JSON API does (GAP-008's rule). Its caller is the actor below.
  const caller = await requireBoardAccess(request, boardId);
  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "POST": {
      const user = await requireFacilitator(request, boardId);
      // GAP-003 residual (BRD-014, DECK-023): notes_locked doesn't apply to
      // action items — they aren't notes — only board_locked does.
      await requireUnlocked(boardId, { board: true });
      const text = data.get("text")?.toString().trim();
      if (!text) throw new Response("Text is required", { status: 422 });
      const over = tooLong("actionItemText", text);
      if (over) throw new Response(over, { status: 422 });
      return Response.json(await createBoardActionItem(boardId, text, user?.id ?? null));
    }

    case "PATCH": {
      const itemId = data.get("itemId")?.toString();
      if (!itemId) throw new Response("Missing itemId", { status: 422 });
      const intent = data.get("intent")?.toString();

      if (intent === "complete") {
        // Any participant with an identity may check off an objective.
        if (!caller) throw new Response("Unauthorized", { status: 401 });
        await requireUnlocked(boardId, { board: true });
        const completed = data.get("completed") === "true";
        return Response.json(await setActionItemCompleted(boardId, itemId, completed, caller.id));
      }

      if (intent === "text") {
        const user = await requireFacilitator(request, boardId);
        await requireUnlocked(boardId, { board: true });
        const text = data.get("text")?.toString().trim();
        if (!text) throw new Response("Text is required", { status: 422 });
        const over = tooLong("actionItemText", text);
        if (over) throw new Response(over, { status: 422 });
        return Response.json(await updateActionItemText(boardId, itemId, text, user?.id ?? null));
      }

      throw new Response("Unknown intent", { status: 400 });
    }

    case "DELETE": {
      const user = await requireFacilitator(request, boardId);
      await requireUnlocked(boardId, { board: true });
      const itemId = data.get("itemId")?.toString();
      if (!itemId) throw new Response("Missing itemId", { status: 422 });
      return Response.json(await deleteActionItemServer(boardId, itemId, user?.id ?? null));
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}
