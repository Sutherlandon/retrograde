// app/routes/api/board.facilitators.$userId.ts
// DELETE /api/v1/boards/:id/facilitators/:userId — revoke a facilitator grant
// (API-017; the browser's DECK-021). Facilitators only. The owner can never be
// removed: only `role = 'facilitator'` rows match. Answers
// `{ facilitators, openFacilitation }`.

import type { ActionFunctionArgs } from "react-router";
import { getFacilitatorsServer, removeFacilitatorServer } from "~/server/board_model";
import { apiError, requireApiBoardAccess, requireApiFacilitator } from "~/server/api_board_guard";

// users.id is a UUID; anything else can't name a facilitator and would be a
// Postgres type error rather than a miss.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "DELETE") return apiError("METHOD_NOT_ALLOWED", "Use DELETE", 405);
  const { id: boardId, userId } = params;
  if (!boardId || !userId) return apiError("BAD_REQUEST", "Missing board or user id", 400);

  const user = await requireApiBoardAccess(request, boardId);
  await requireApiFacilitator(user, boardId);

  const notFound = () =>
    apiError("NOT_FOUND", "That user is not a facilitator on this board (an owner can't be removed)", 404);
  if (!UUID.test(userId)) return notFound();
  if (!(await removeFacilitatorServer(boardId, userId))) return notFound();
  return Response.json(await getFacilitatorsServer(boardId));
}

export function loader() {
  return apiError("METHOD_NOT_ALLOWED", "Use DELETE", 405);
}
