// app/routes/api/board.ts
// GET /api/v1/boards/:id — JSON board state. Public read (matches existing
// world-readable behavior of /app/board/:id). No auth required.

import type { LoaderFunctionArgs } from "react-router";
import { getBoardServer } from "~/server/board_model";
import { getApiUser } from "~/hooks/useAuth";
import { getBoardAccess } from "~/server/board_permissions";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const id = params.id;
  if (!id) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "Missing board id" } },
      { status: 400 }
    );
  }

  // Pull user context if provided so user_votes is populated correctly.
  // Public reads (no auth) still work on unrestricted boards; user_votes just
  // stays 0. Members-only crews gate access to members and matching API keys.
  const user = await getApiUser(request);
  const apiTeamId = (user as { teamId?: string } | null)?.teamId ?? null;
  const access = await getBoardAccess(id, user?.id ?? null, apiTeamId);

  if (!access.exists) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Board not found" } },
      { status: 404 }
    );
  }
  if (!access.allowed) {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "This board is restricted to its crew" } },
      { status: 403 }
    );
  }

  const board = await getBoardServer(id, user?.id ?? null);
  if (!board) {
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Board not found" } },
      { status: 404 }
    );
  }

  return Response.json(board);
}
