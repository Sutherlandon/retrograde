// app/routes/api/board.facilitators.ts
// GET  /api/v1/boards/:id/facilitators — the board's owner and facilitators
//      (API-015).
// POST /api/v1/boards/:id/facilitators — grant facilitator to a registered
//      user by username (API-016; the browser's DECK-020).
// Facilitators only, as in the browser, and never lock-gated. Board access is
// checked first, which the browser route does not do (GAP-008's rule).
// Both answer `{ facilitators, openFacilitation }`.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getFacilitatorsServer, addFacilitatorServer } from "~/server/board_model";
import { findRegisteredUserByUsername } from "~/server/admin_model";
import {
  apiError, requireApiBoardAccess, requireApiFacilitator, readJsonObject,
} from "~/server/api_board_guard";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const boardId = params.id;
  if (!boardId) return apiError("BAD_REQUEST", "Missing board id", 400);

  const user = await requireApiBoardAccess(request, boardId);
  await requireApiFacilitator(user, boardId);
  return Response.json(await getFacilitatorsServer(boardId));
}

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") return apiError("METHOD_NOT_ALLOWED", "Use GET or POST", 405);
  const boardId = params.id;
  if (!boardId) return apiError("BAD_REQUEST", "Missing board id", 400);

  const user = await requireApiBoardAccess(request, boardId);
  await requireApiFacilitator(user, boardId);

  const body = await readJsonObject(request);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!username) return apiError("BAD_REQUEST", "`username` is required", 400);

  const target = await findRegisteredUserByUsername(username);
  if (!target) {
    return apiError("NOT_FOUND", `No registered user found with username "${username}"`, 404);
  }
  await addFacilitatorServer(boardId, target.id);
  return Response.json(await getFacilitatorsServer(boardId), { status: 201 });
}
