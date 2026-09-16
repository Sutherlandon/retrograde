import { redirect } from "react-router";
import { getSession, destroySession } from "../../session.server";
import { oauthLogoutRedirectUrl } from "~/server/db_config";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request.headers.get("Cookie"));

  return redirect(oauthLogoutRedirectUrl, {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}
