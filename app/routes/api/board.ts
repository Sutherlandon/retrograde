// app/routes/api/board.ts
// GET /api/v1/boards/:id — JSON board state. Public read (matches existing
// world-readable behavior of /app/board/:id). No auth required.

import type { LoaderFunctionArgs } from "react-router";
import { getBoardServer } from "~/server/board_model";
import { getApiUser } from "~/hooks/useAuth";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "Missing board id" } },
      { status: 400 }
    );
  }

  // Pull user context if provided so user_votes is populated correctly.
  // Public reads (no auth) still work; user_votes just stays 0.
  const user = await getApiUser(request);
  const board = await getBoardServer(id, user?.id ?? null);

  if (!board) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Board not found" } },
      { status: 404 }
    );
  }

  return Response.json(board);
}
