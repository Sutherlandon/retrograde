import { redirect } from "react-router";
import crypto from "crypto";
import { getSession, commitSession } from "../../session.server";
import { oauthRedirectUri } from "~/server/db_config";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const session = await getSession(request.headers.get("Cookie"));
  const returnTo = url.searchParams.get("returnTo");

  const state = Buffer.from(JSON.stringify({
    returnTo,
    nonce: crypto.randomUUID()
  })).toString("base64url");

  session.set("oauth_state", state);
  const setCookieHeader = await commitSession(session);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.OAUTH_CLIENT_ID!,
    redirect_uri: oauthRedirectUri,
    scope: process.env.OAUTH_SCOPES!,
    state,
  });

  return redirect(
    `${process.env.OAUTH_AUTHORIZATION_URL}?${params}`,
    {
      headers: {
        "Set-Cookie": setCookieHeader,
      },
    }
  );
}

