// routes/app/board.timer.ts
// Resource route — no UI. Handles timer start/stop for a board.
// POST   → start timer
// DELETE → stop timer

import { type ActionFunctionArgs } from "react-router";
import { startTimerServer, stopTimerServer } from "~/server/board_model";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

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