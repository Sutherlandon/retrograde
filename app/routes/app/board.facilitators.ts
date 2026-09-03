// routes/app/board.facilitators.ts
// Resource route — no UI. Manages board facilitators (issue #97, ADR-0006).
// GET    → { facilitators, openFacilitation }
// POST   → grant facilitator by username
// DELETE → revoke a facilitator (owners can never be removed)
// PATCH  → toggle open_facilitation

import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import {
  listFacilitatorsServer,
  addFacilitatorServer,
  removeFacilitatorServer,
  setOpenFacilitationServer,
  getOpenFacilitationServer,
} from "~/server/board_model";
import { requireFacilitator } from "~/server/board_permissions";
import { findRegisteredUserByUsername } from "~/server/admin_model";

async function crewState(boardId: string) {
  const [facilitators, openFacilitation] = await Promise.all([
    listFacilitatorsServer(boardId),
    getOpenFacilitationServer(boardId),
  ]);
  return { facilitators, openFacilitation: openFacilitation === true };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });
  await requireFacilitator(request, boardId);
  return Response.json(await crewState(boardId));
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Board ID Missing", { status: 400 });

  await requireFacilitator(request, boardId);
  const data = await request.formData();

  switch (request.method.toUpperCase()) {
    case "POST": {
      const username = data.get("username")?.toString().trim();
      if (!username) {
        return Response.json({ error: "Username is required.", ...(await crewState(boardId)) });
      }
      const target = await findRegisteredUserByUsername(username);
      if (!target) {
        return Response.json({
          error: `No registered user found with username "${username}".`,
          ...(await crewState(boardId)),
        });
      }
      await addFacilitatorServer(boardId, target.id);
      return Response.json(await crewState(boardId));
    }

    case "DELETE": {
      const userId = data.get("userId")?.toString();
      if (!userId) throw new Response("Missing userId", { status: 422 });
      await removeFacilitatorServer(boardId, userId);
      return Response.json(await crewState(boardId));
    }

    case "PATCH": {
      const open = data.get("openFacilitation") === "true";
      // GAP-002 invariant: a crewless board can never close facilitation.
      // setOpenFacilitationServer refuses the write in SQL and reports it
      // here rather than throwing, so the caller sees the current (still
      // TRUE) state alongside the reason.
      const applied = await setOpenFacilitationServer(boardId, open);
      if (!applied) {
        return Response.json({
          error: "Anonymous boards are open to everyone.",
          ...(await crewState(boardId)),
        });
      }
      return Response.json(await crewState(boardId));
    }

    default:
      throw new Response("Method Not Allowed", { status: 405 });
  }
}
