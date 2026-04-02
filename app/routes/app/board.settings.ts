// routes/app/board.settings.ts
// Resource route — no UI. Handles board settings mutations.
// PATCH → update voting_enabled and voting_allowed
// POST  → clear all votes and likes (called before enabling voting)

import { type ActionFunctionArgs } from "react-router";
import { getOptionalUser } from "~/hooks/useAuth";
import {
  updateBoardSettingsServer,
  clearBoardVotesServer,
  getBoardServer,
} from "~/server/board_model";
import { pool } from "~/server/db_config";

async function requireOwner(request: Request, boardId: string) {
  const user = await getOptionalUser(request);
  if (!user) throw new Response("Unauthorized", { status: 401 });

  const res = await pool.query(
    `SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2`,
    [boardId, user.id]
  );
  if (res.rowCount === 0 || res.rows[0].role !== "owner") {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "PATCH": {
      const user = await requireOwner(request, boardId);
      const votingEnabled = data.get("votingEnabled") === "true";
      const votingAllowed = Number(data.get("votingAllowed"));
      const notesLocked = data.get("notesLocked") === "true";
      const boardLocked = data.get("boardLocked") === "true";
      if (isNaN(votingAllowed) || votingAllowed < 1) {
        throw new Response("Invalid votingAllowed", { status: 422 });
      }
      return updateBoardSettingsServer(boardId, { votingEnabled, votingAllowed, notesLocked, boardLocked });
    }

    case "POST": {
      // Clear all votes/likes — called when enabling voting to wipe existing likes
      await requireOwner(request, boardId);
      await clearBoardVotesServer(boardId);
      return getBoardServer(boardId);
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}
