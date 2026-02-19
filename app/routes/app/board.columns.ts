// routes/app/board.columns.ts
// Resource route — no UI. Handles all column mutations for a board.
// POST   → add column
// PATCH  → update column title
// DELETE → delete column

import { type ActionFunctionArgs } from "react-router";
import {
  addColumnServer,
  updateColumnTitleServer,
  deleteColumnServer,
} from "~/server/board_model";

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "POST": {
      const id = data.get("id") as string;
      const title = data.get("title") as string;
      const colOrder = Number(data.get("col_order"));
      if (!id || !title || isNaN(colOrder)) {
        throw new Response("Missing column fields", { status: 422 });
      }
      return addColumnServer(boardId, id, title, colOrder);
    }

    case "PATCH": {
      const columnId = data.get("columnId") as string;
      const newTitle = data.get("title") as string;
      if (!columnId || !newTitle) {
        throw new Response("Missing columnId or title", { status: 422 });
      }
      return updateColumnTitleServer(boardId, columnId, newTitle);
    }

    case "DELETE": {
      const columnId = data.get("columnId") as string;
      if (!columnId) throw new Response("Missing columnId", { status: 422 });
      return deleteColumnServer(boardId, columnId);
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}