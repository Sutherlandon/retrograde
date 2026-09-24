import { redirect } from "react-router";
import { getSession, destroySession } from "../../session.server";
import { oauthLogoutRedirectUrl } from "~/server/db_config";
import { logMetric } from "~/server/logger";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request.headers.get("Cookie"));
  logMetric("Logout", { userId: session.get("userId") });

  return redirect(oauthLogoutRedirectUrl, {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}
