// routes/app/board.settings.ts
// Resource route — no UI. Handles board settings mutations.
// PATCH → update voting/lock/attribution settings (facilitators — ADR-0006)
// POST  → clear all votes and likes (called before enabling voting)

import { type ActionFunctionArgs } from "react-router";
import {
  updateBoardSettingsServer,
  clearBoardVotesServer,
  getBoardServer,
} from "~/server/board_model";
import { requireFacilitator } from "~/server/board_permissions";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "PATCH": {
      // The facilitator's id scopes the returned board in blind-brainstorm mode.
      const viewerId = (await requireFacilitator(request, boardId))?.id;
      const votingEnabled = data.get("votingEnabled") === "true";
      const votingAllowed = Number(data.get("votingAllowed"));
      const votingScope = (data.get("votingScope") as string) || "board";
      const notesLocked = data.get("notesLocked") === "true";
      const boardLocked = data.get("boardLocked") === "true";
      const attributionEnabled = data.get("attributionEnabled") === "true";
      // Absent → keep the column visible (its default); only an explicit "false" hides it.
      const actionItemsVisible = data.has("actionItemsVisible")
        ? data.get("actionItemsVisible") === "true"
        : true;
      const hideOthersNotes = data.get("hideOthersNotes") === "true";
      if (isNaN(votingAllowed) || votingAllowed < 1) {
        throw new Response("Invalid votingAllowed", { status: 422 });
      }
      return updateBoardSettingsServer(boardId, { votingEnabled, votingAllowed, votingScope, notesLocked, boardLocked, attributionEnabled, actionItemsVisible, hideOthersNotes }, viewerId);
    }

    case "POST": {
      // Clear all votes/likes — called when enabling voting to wipe existing likes
      const viewerId = (await requireFacilitator(request, boardId))?.id;
      await clearBoardVotesServer(boardId);
      return getBoardServer(boardId, viewerId);
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}
