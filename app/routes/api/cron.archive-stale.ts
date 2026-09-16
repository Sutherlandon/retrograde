// app/routes/api/cron.archive-stale.ts
// Daily cleanup of stale free-tier boards. See ADR-0005.
//
// Vercel's scheduler (vercel.json `crons`) invokes a cron path with an HTTP
// GET, and sends CRON_SECRET as an `Authorization: Bearer` header
// automatically when that variable is set on the project — so GET is the
// method that has to work. A self-hosted instance calls the same URL from its
// own scheduler and may use either method.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { archiveStaleBoards } from "~/server/auto_archive";
import { cronSecret } from "~/server/db_config";

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function archiveIfAuthorized(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return err("METHOD_NOT_ALLOWED", "Use GET or POST", 405);
  }

  if (request.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return err("UNAUTHORIZED", "Invalid or missing CRON_SECRET", 401);
  }

  const result = await archiveStaleBoards();
  return Response.json(result, { status: 200 });
}

export function loader({ request }: LoaderFunctionArgs) {
  return archiveIfAuthorized(request);
}

export function action({ request }: ActionFunctionArgs) {
  return archiveIfAuthorized(request);
}
