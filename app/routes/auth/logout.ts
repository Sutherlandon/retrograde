import { redirect } from "react-router";
import { getSession, destroySession } from "../../session.server";
import { logMetric } from "~/server/logger";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request.headers.get("Cookie"));
  logMetric("Logout", { userId: session.get("userId") });

  return redirect(process.env.LOGOUT_REDIRECT_URL || "/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}
