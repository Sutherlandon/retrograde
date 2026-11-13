// routes/app/board.poll.ts
// Board poll (ADR-0029). `?v=<n>` is the version the client already shows:
// when it equals the board's current version and no timer has run out, the
// answer is 204 with no body and the snapshot is never built. Access is
// checked on every poll.
import { type LoaderFunctionArgs } from "react-router";
import { getBoardSnapshot } from "~/server/board_snapshot";
import { resolveBoardAccess } from "~/server/board_permissions";

/** The client's version, or null when `v` is absent or not a non-negative integer. */
function parseVersion(request: Request): number | null {
  const v = new URL(request.url).searchParams.get("v");
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { id: boardId } = params;
  if (!boardId) throw new Response("Missing ID", { status: 400 });

  const { user, access } = await resolveBoardAccess(request, boardId);

  const known = parseVersion(request);
  if (known !== null && known === access.version && !access.timerExpired) {
    return new Response(null, { status: 204 });
  }

  const board = await getBoardSnapshot(boardId, user?.id);
  if (!board) throw new Response("Not Found", { status: 404 });

  return Response.json(board);
}
