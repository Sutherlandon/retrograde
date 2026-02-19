// routes/app/board.tsx
// Responsible for: loading board data, rendering the board UI.
// All mutations are handled by child resource routes under /app/board/:id/*

import { type LoaderFunctionArgs } from "react-router";
import { BoardProvider } from "~/context/BoardContext";
import Board from "~/components/Board";
import { getBoardServer, stopTimerServer } from "~/server/board_model";
import { exampleBoardTutorial } from "~/example-data/example_board_tutorial";
import { exampleBoardRealWorld } from "~/example-data/real_ai_example";

export async function loader({ params }: LoaderFunctionArgs) {
  const { id: board_id } = params;

  if (!board_id) {
    throw new Response("Board ID Missing", { status: 400 });
  }

  // Example / read-only boards — no DB needed
  if (board_id === "example-board") return exampleBoardTutorial;
  if (board_id === "example-board-real-world") return exampleBoardRealWorld;

  const board = await getBoardServer(board_id);

  if (!board) {
    throw new Response("Board Not Found", { status: 404 });
  }

  // Expire a timer that ended while nobody was watching
  if (board.timerRunning && board.timerEndsAt) {
    if (new Date(board.timerEndsAt).getTime() <= Date.now()) {
      await stopTimerServer(board.id);
      board.timerRunning = false;
      board.timerEndsAt = null;
    }
  }

  return board;
}

export default function BoardRoute() {
  return (
    <BoardProvider>
      <Board />
    </BoardProvider>
  );
}