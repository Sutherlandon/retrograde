// app/routes/api/cron.archive-stale.ts
// Daily cron endpoint that auto-archives stale free-tier boards. See ADR-0005.
//
// Triggered by Vercel cron (configured in vercel.json) which sends
//   Authorization: Bearer <CRON_SECRET>
// The CRON_SECRET env var must be set on the deployment.

import type { ActionFunctionArgs } from "react-router";
import { archiveStaleBoards } from "~/server/auto_archive";
import { cronSecret } from "~/server/db_config";

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return err("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  const secret = cronSecret;
  if (!secret) {
    return err("MISCONFIGURED", "CRON_SECRET env var not set", 500);
  }

  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${secret}`) {
    return err("UNAUTHORIZED", "Invalid or missing CRON_SECRET", 401);
  }

  const result = await archiveStaleBoards();
  return Response.json(result, { status: 200 });
}

export function loader() {
  return err("METHOD_NOT_ALLOWED", "Use POST", 405);
}
