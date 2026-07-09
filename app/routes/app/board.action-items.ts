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
import { requireFacilitator } from "~/server/board_permissions";
import { getOptionalUser } from "~/hooks/useAuth";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "POST": {
      const user = await requireFacilitator(request, boardId);
      const text = data.get("text")?.toString().trim();
      if (!text) throw new Response("Text is required", { status: 422 });
      return Response.json(await createBoardActionItem(boardId, text, user?.id ?? null));
    }

    case "PATCH": {
      const itemId = data.get("itemId")?.toString();
      if (!itemId) throw new Response("Missing itemId", { status: 422 });
      const intent = data.get("intent")?.toString();

      if (intent === "complete") {
        // Any participant with a session may check off an objective.
        const user = await getOptionalUser(request);
        if (!user) throw new Response("Unauthorized", { status: 401 });
        const completed = data.get("completed") === "true";
        return Response.json(await setActionItemCompleted(boardId, itemId, completed, user.id));
      }

      if (intent === "text") {
        const user = await requireFacilitator(request, boardId);
        const text = data.get("text")?.toString().trim();
        if (!text) throw new Response("Text is required", { status: 422 });
        return Response.json(await updateActionItemText(boardId, itemId, text, user?.id ?? null));
      }

      throw new Response("Unknown intent", { status: 400 });
    }

    case "DELETE": {
      const user = await requireFacilitator(request, boardId);
      const itemId = data.get("itemId")?.toString();
      if (!itemId) throw new Response("Missing itemId", { status: 422 });
      return Response.json(await deleteActionItemServer(boardId, itemId, user?.id ?? null));
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}
