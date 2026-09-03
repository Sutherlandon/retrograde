// app/routes/api/board.action-items.ts
// POST /api/v1/boards/:id/action-items — bulk create action items.
// Agent-facing API parity for issue #88 (ADR-0001: no second-class operations).
// Auth: Authorization: Bearer <rk_live_ key or legacy agent_token>.
// Permission: caller must be able to facilitate the board (agents own the
// boards they create, so their own boards always pass).

import type { ActionFunctionArgs } from "react-router";
import { bulkCreateBoardActionItems } from "~/server/action_item_model";
import { userCanFacilitate, getBoardAccess } from "~/server/board_permissions";
import { getApiUser } from "~/hooks/useAuth";

const MAX_ITEMS_PER_REQUEST = 100;
const MAX_TEXT_LENGTH = 2000;

type BulkActionItemsRequest = {
  items?: { text: string }[];
};

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return err("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  const boardId = params.id;
  if (!boardId) return err("BAD_REQUEST", "Missing board id", 400);

  const user = await getApiUser(request);
  if (!user) {
    return err("UNAUTHORIZED", "Authorization: Bearer <api key or agent_token> required", 401);
  }

  // GAP-008: userCanFacilitate alone passes for any caller when
  // open_facilitation is on, even one with no relationship to a members-only
  // board's crew. Check board access first, matching api/board.ts.
  const apiTeamId = (user as { teamId?: string } | null)?.teamId ?? null;
  const access = await getBoardAccess(boardId, user.id, apiTeamId);
  if (!access.exists) {
    return err("NOT_FOUND", "Board not found", 404);
  }
  if (!access.allowed) {
    return err("FORBIDDEN", "This board is restricted to its crew", 403);
  }

  if (!(await userCanFacilitate(user.id, boardId))) {
    return err("FORBIDDEN", "Caller cannot facilitate this board", 403);
  }

  let body: BulkActionItemsRequest;
  try {
    body = (await request.json()) as BulkActionItemsRequest;
  } catch {
    return err("BAD_REQUEST", "Body must be valid JSON", 400);
  }

  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return err("BAD_REQUEST", "`items` must be a non-empty array", 400);
  }
  if (items.length > MAX_ITEMS_PER_REQUEST) {
    return err("PAYLOAD_TOO_LARGE", `Too many items; max ${MAX_ITEMS_PER_REQUEST} per request`, 413);
  }
  for (const item of items) {
    if (!item || typeof item.text !== "string" || item.text.trim().length === 0) {
      return err("BAD_REQUEST", "Each item needs non-empty `text`", 400);
    }
    if (item.text.length > MAX_TEXT_LENGTH) {
      return err("BAD_REQUEST", `Item text exceeds ${MAX_TEXT_LENGTH} chars`, 400);
    }
  }

  const board = await bulkCreateBoardActionItems(
    boardId,
    items.map((i) => i.text.trim()),
    user.id
  );
  if (!board) return err("NOT_FOUND", "Board not found", 404);
  return Response.json(board, { status: 201 });
}

export function loader() {
  return err("METHOD_NOT_ALLOWED", "Use POST", 405);
}
