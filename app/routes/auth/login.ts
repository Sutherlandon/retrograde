import { redirect } from "react-router";
import crypto from "crypto";
import { getSession, commitSession } from "../../session.server";
import { oauthAuthorizationUrl, oauthClientId, oauthRedirectUri, oauthScopes } from "~/server/db_config";

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
    client_id: oauthClientId,
    redirect_uri: oauthRedirectUri,
    scope: oauthScopes,
    state,
  });

  return redirect(
    `${oauthAuthorizationUrl}?${params}`,
    {
      headers: {
        "Set-Cookie": setCookieHeader,
      },
    }
  );
}

