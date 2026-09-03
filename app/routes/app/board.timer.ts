// routes/app/board.timer.ts
// Resource route — no UI. Handles timer start/stop for a board.
// POST   → start timer
// DELETE → stop timer

import { type ActionFunctionArgs } from "react-router";
import { startTimerServer, stopTimerServer } from "~/server/board_model";
import { requireBoardAccess, requireFacilitator, requireUnlocked } from "~/server/board_permissions";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  // DECK-002/003: the timer is a facilitator control. requireFacilitator alone
  // doesn't cover a members-only board when open_facilitation admits outsiders,
  // so board access is checked first.
  await requireBoardAccess(request, boardId);
  await requireFacilitator(request, boardId);
  await requireUnlocked(boardId, { board: true });

  switch (request.method.toUpperCase()) {
    case "POST": {
      const data = await request.formData();
      const seconds = Number(data.get("seconds"));
      if (!seconds || seconds <= 0) {
        throw new Response("Invalid timer duration", { status: 422 });
      }
      await startTimerServer(boardId, seconds);
      return { ok: true };
    }

    case "DELETE": {
      await stopTimerServer(boardId);
      return { ok: true };
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}