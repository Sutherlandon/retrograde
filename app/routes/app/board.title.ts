// routes/app/board.title.ts
// Resource route — no UI. Handles board title updates.
// PATCH → update board title

import { type ActionFunctionArgs } from "react-router";
import { updateBoardTitleServer } from "~/server/board_model";
import { requireBoardAccess, requireFacilitator, requireUnlocked } from "~/server/board_permissions";
import { tooLong } from "~/config/board_limits";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  if (request.method.toUpperCase() !== "PATCH") {
    throw new Response("Method Not Allowed", { status: 405 });
  }

  // BRD-003: renaming the board is a facilitator control. requireFacilitator
  // alone doesn't cover a members-only board when open_facilitation admits
  // outsiders, so board access is checked first.
  const user = await requireBoardAccess(request, boardId);
  await requireFacilitator(request, boardId);
  await requireUnlocked(boardId, { board: true });

  const data = await request.formData();
  const newTitle = (data.get("title") as string)?.trim();
  if (!newTitle) throw new Response("Title is required", { status: 422 });
  const over = tooLong("boardTitle", newTitle);
  if (over) throw new Response(over, { status: 422 });

  // Scoped to the caller, as every other board write is, so blind-brainstorm
  // mode doesn't hand back an empty board.
  return updateBoardTitleServer(boardId, newTitle, user?.id);
}