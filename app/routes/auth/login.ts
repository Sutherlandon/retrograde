import { redirect } from "react-router";
import crypto from "crypto";
import { getSession, commitSession } from "../../session.server";

export async function loader({ request }) {
  const session = await getSession(request.headers.get("Cookie"));

  const state = crypto.randomBytes(16).toString("hex");
  session.set("oauth_state", state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.OAUTH_CLIENT_ID!,
    redirect_uri: process.env.OAUTH_REDIRECT_URI!,
    scope: process.env.OAUTH_SCOPES!,
    state,
  });

  return redirect(
    `${process.env.OAUTH_AUTHORIZATION_URL}?${params}`,
    {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    }
  );
}
