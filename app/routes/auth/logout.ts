import { redirect } from "react-router";
import { getSession, destroySession } from "../../session.server";

export async function loader({ request }: { request: Request }) {
  const session = await getSession(request.headers.get("Cookie"));

  return redirect(process.env.LOGOUT_REDIRECT_URL || "/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}
