import { redirect } from "react-router";
import crypto from "crypto";
import { getSession, commitSession } from "../../session.server";
import { oauthAuthorizationUrl, oauthClientId, oauthRedirectUri, oauthScopes } from "~/server/db_config";
import { boardIdFromReturnTo, recordGrowthEvent, type GrowthEvent } from "~/server/growth_model";
import { CLAIM_REMINDER_REF, KEEP_REF } from "~/config/growth_refs";

// BRD-021: the Log in links under a board carry one of these refs, so the
// click is counted against that board before sign-in starts.
const CLICK_EVENTS: Record<string, GrowthEvent> = {
  [KEEP_REF]: "keep_click",
  [CLAIM_REMINDER_REF]: "claim_reminder_click",
};

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const session = await getSession(request.headers.get("Cookie"));
  const returnTo = url.searchParams.get("returnTo");

  const clickEvent = CLICK_EVENTS[url.searchParams.get("ref") ?? ""];
  if (clickEvent) {
    await recordGrowthEvent(clickEvent, { boardId: boardIdFromReturnTo(returnTo), userId: session.get("userId") ?? null });
  }

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

