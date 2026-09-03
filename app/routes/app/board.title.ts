// routes/app/board.title.ts
// Resource route — no UI. Handles board title updates.
// PATCH → update board title

import { type ActionFunctionArgs } from "react-router";
import { updateBoardTitleServer } from "~/server/board_model";
import { requireBoardAccess } from "~/server/board_permissions";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  if (request.method.toUpperCase() !== "PATCH") {
    throw new Response("Method Not Allowed", { status: 405 });
  }

  await requireBoardAccess(request, boardId);

  const data = await request.formData();
  const newTitle = (data.get("title") as string)?.trim();
  if (!newTitle) throw new Response("Title is required", { status: 422 });

  return updateBoardTitleServer(boardId, newTitle);
}