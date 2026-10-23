// routes/app/board.columns.ts
// Resource route — no UI. Handles all column mutations for a board.
// POST   → add column
// PATCH  → update column title
// DELETE → delete column

import { type ActionFunctionArgs } from "react-router";
import { requireBoardAccess, requireFacilitator, requireUnlocked } from "~/server/board_permissions";
import { tooLong } from "~/config/board_limits";
import { logMetric } from "~/server/logger";
import {
  addColumnServer,
  updateColumnTitleServer,
  updateColumnPromptServer,
  deleteColumnServer,
} from "~/server/board_model";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  // The acting caller's id scopes the returned board in blind-brainstorm mode.
  const viewerId = (await requireBoardAccess(request, boardId))?.id;

  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "POST": {
      // DECK-006: adding a column is a facilitator control.
      await requireFacilitator(request, boardId);
      await requireUnlocked(boardId, { board: true });

      const id = data.get("id") as string;
      const title = data.get("title") as string;
      const colOrder = Number(data.get("col_order"));
      if (!id || !title || isNaN(colOrder)) {
        throw new Response("Missing column fields", { status: 422 });
      }
      const titleTooLong = tooLong("columnTitle", title);
      if (titleTooLong) throw new Response(titleTooLong, { status: 422 });
      return addColumnServer(boardId, id, title, colOrder, viewerId);
    }

    case "PATCH": {
      const columnId = data.get("columnId") as string;
      if (!columnId) throw new Response("Missing columnId", { status: 422 });

      const intent = data.get("intent") as string;
      if (intent === "updatePrompt") {
        // BRD-012: prompt text is a facilitator control.
        await requireFacilitator(request, boardId);
        await requireUnlocked(boardId, { board: true });

        const prompt = data.get("prompt") as string ?? "";
        const promptTooLong = tooLong("columnPrompt", prompt);
        if (promptTooLong) throw new Response(promptTooLong, { status: 422 });
        return updateColumnPromptServer(boardId, columnId, prompt, viewerId);
      }

      // BRD-011: column title stays participant-level — access + lock only.
      await requireUnlocked(boardId, { notes: true });

      const newTitle = data.get("title") as string;
      if (!newTitle) throw new Response("Missing title", { status: 422 });
      const titleTooLong = tooLong("columnTitle", newTitle);
      if (titleTooLong) throw new Response(titleTooLong, { status: 422 });
      return updateColumnTitleServer(boardId, columnId, newTitle, viewerId);
    }

    case "DELETE": {
      // BRD-013: deleting a column is a facilitator control.
      await requireFacilitator(request, boardId);
      await requireUnlocked(boardId, { board: true });

      const columnId = data.get("columnId") as string;
      if (!columnId) throw new Response("Missing columnId", { status: 422 });
      logMetric("Delete Column", { userId: viewerId, boardId, columnId });
      return deleteColumnServer(boardId, columnId, viewerId);
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}