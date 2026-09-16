// app/routes/api/cron.archive-stale.ts
// Daily cleanup of stale free-tier boards. See ADR-0005.
//
// Vercel's scheduler (vercel.json `crons`) invokes a cron path with an HTTP
// GET, and sends CRON_SECRET as an `Authorization: Bearer` header
// automatically when that variable is set on the project — so GET is the
// method that has to work; POST is accepted too. A self-hosted instance runs
// no scheduled cleanup and answers 404 (ADR-0020).

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { archiveStaleBoards } from "~/server/auto_archive";
import { cronSecret } from "~/server/db_config";

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function archiveIfAuthorized(request: Request): Promise<Response> {
  // A self-hosted instance runs no scheduled cleanup: answer as if the route did
  // not exist, before looking at any credential.
  if (!cronSecret) {
    return err("NOT_FOUND", "Scheduled cleanup does not run on this instance", 404);
  }

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
