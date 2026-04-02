// routes/app/board.poll.ts
import { type LoaderFunctionArgs } from "react-router";
import { getBoardServer, stopTimerServer } from "~/server/board_model";
import { getAttachmentsServer } from "~/server/attachment_model";
import { getOptionalUser } from "~/hooks/useAuth";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Missing ID", { status: 400 });

  const user = await getOptionalUser(request);
  const board = await getBoardServer(boardId, user?.id);
  if (!board) throw new Response("Not Found", { status: 404 });

  if (board.timerRunning && board.timerEndsAt) {
    if (new Date(board.timerEndsAt).getTime() <= Date.now()) {
      await stopTimerServer(board.id);
      board.timerRunning = false;
      board.timerEndsAt = null;
    }
  }

  board.attachments = await getAttachmentsServer(boardId);

  return Response.json(board);
}