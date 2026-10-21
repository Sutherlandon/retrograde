// routes/app/board.poll.ts
import { type LoaderFunctionArgs } from "react-router";
import { getBoardSnapshot } from "~/server/board_snapshot";
import { requireBoardAccess } from "~/server/board_permissions";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Missing ID", { status: 400 });

  const user = await requireBoardAccess(request, boardId);
  const board = await getBoardSnapshot(boardId, user?.id);
  if (!board) throw new Response("Not Found", { status: 404 });

  return Response.json(board);
}
