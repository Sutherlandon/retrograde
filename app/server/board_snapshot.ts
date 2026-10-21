// app/server/board_snapshot.ts
// The board as a reader sees it right now — what the browser's poll and the
// agent API's GET both return, so a person and an agent read the same state
// (ADR-0027): the viewer-scoped board, a timer that has run out stopped, and
// the board's attachments.

import { getBoardServer, stopTimerServer } from "./board_model";
import { getAttachmentsServer } from "./attachment_model";
import type { BoardDTO } from "./board.types";

export async function getBoardSnapshot(boardId: string, viewerId: string | null | undefined): Promise<BoardDTO | null> {
  const board = await getBoardServer(boardId, viewerId);
  if (!board) return null;

  if (board.timerRunning && board.timerEndsAt && new Date(board.timerEndsAt).getTime() <= Date.now()) {
    await stopTimerServer(board.id);
    board.timerRunning = false;
    board.timerEndsAt = null;
  }

  board.attachments = await getAttachmentsServer(boardId);
  return board;
}
