// app/server/board_actions.ts
// Shared board-mutation intent handler used by both the dashboard and the
// crew page actions. Both pages surface the same board controls (row menu +
// bulk bar), so the mutation logic lives here once. `createBoard` is NOT here
// because its team-defaulting differs per page (see each route's action).

import { redirect } from "react-router";
import {
  duplicateBoardServer,
  deleteBoardServer,
  archiveBoardServer,
  unarchiveBoardServer,
  moveBoardsToTeamServer,
  bulkDeleteBoardsServer,
} from "./board_model";

/** `handled: false` means the intent isn't a board mutation — the caller
 *  should fall through to its own intents. */
export type BoardMutationResult =
  | { handled: false }
  | { handled: true; result: Response | Record<string, number> | null };

const requireBoardId = (formData: FormData): string => {
  const boardId = formData.get("boardId")?.toString();
  if (!boardId) throw new Response("Missing boardId", { status: 400 });
  return boardId;
};

const boardIds = (formData: FormData): string[] =>
  (formData.get("boardIds")?.toString() ?? "").split(",").filter(Boolean);

export async function handleBoardMutation(
  intent: string | undefined,
  formData: FormData,
  userId: string
): Promise<BoardMutationResult> {
  switch (intent) {
    case "duplicate": {
      const newBoardId = await duplicateBoardServer(requireBoardId(formData), userId);
      return { handled: true, result: redirect(`/app/board/${newBoardId}`) };
    }

    case "delete": {
      // Return null (revalidate + stay) rather than redirecting, so this works
      // identically on the dashboard and the crew page.
      await deleteBoardServer(requireBoardId(formData), userId);
      return { handled: true, result: null };
    }

    case "archive": {
      await archiveBoardServer(requireBoardId(formData), userId);
      return { handled: true, result: null };
    }

    case "unarchive": {
      await unarchiveBoardServer(requireBoardId(formData), userId);
      return { handled: true, result: null };
    }

    // Move a single board to a crew ("none" = remove from its crew).
    case "moveBoard": {
      const boardId = requireBoardId(formData);
      const teamId = formData.get("teamId")?.toString();
      if (!teamId) throw new Response("Missing teamId", { status: 400 });
      const moved = await moveBoardsToTeamServer([boardId], teamId === "none" ? null : teamId, userId);
      return { handled: true, result: { moved: moved.length } };
    }

    case "bulkMove": {
      const ids = boardIds(formData);
      const teamId = formData.get("teamId")?.toString();
      if (ids.length === 0 || !teamId) throw new Response("Missing boardIds or teamId", { status: 400 });
      const moved = await moveBoardsToTeamServer(ids, teamId === "none" ? null : teamId, userId);
      return { handled: true, result: { moved: moved.length } };
    }

    case "bulkDelete": {
      const ids = boardIds(formData);
      if (ids.length === 0) throw new Response("Missing boardIds", { status: 400 });
      const deleted = await bulkDeleteBoardsServer(ids, userId);
      return { handled: true, result: { deleted: deleted.length } };
    }

    default:
      return { handled: false };
  }
}
