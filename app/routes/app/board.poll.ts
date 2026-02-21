// routes/app/board.poll.ts
import { type LoaderFunctionArgs } from "react-router";
import { getBoardServer, stopTimerServer } from "~/server/board_model";

export async function loader({ params }: LoaderFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Missing ID", { status: 400 });

  const board = await getBoardServer(boardId);
  if (!board) throw new Response("Not Found", { status: 404 });

  if (board.timerRunning && board.timerEndsAt) {
    if (new Date(board.timerEndsAt).getTime() <= Date.now()) {
      await stopTimerServer(board.id);
      board.timerRunning = false;
      board.timerEndsAt = null;
    }
  }

  return Response.json(board);
}