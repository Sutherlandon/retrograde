import { redirect } from "react-router";
import crypto from "crypto";
import { getSession, commitSession } from "../../session.server";
import { oauthAuthorizationUrl, oauthClientId, oauthRedirectUri, oauthScopes } from "~/server/db_config";
import { boardIdFromReturnTo, recordEvent, type EventName } from "~/server/event_model";
import { CLAIM_REMINDER_REF, KEEP_REF } from "~/config/growth_refs";

// The Log in links under a board carry one of these refs, so the click is
// counted against that board, and the action it belongs to, before sign-in.
const CLICK_EVENTS: Record<string, { name: EventName; actionId: string }> = {
  [KEEP_REF]: { name: "keep_click", actionId: "BRD-021" },
  [CLAIM_REMINDER_REF]: { name: "claim_reminder_click", actionId: "BRD-020" },
};

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const session = await getSession(request.headers.get("Cookie"));
  const returnTo = url.searchParams.get("returnTo");

  const click = CLICK_EVENTS[url.searchParams.get("ref") ?? ""];
  if (click) {
    await recordEvent(click.name, {
      actionId: click.actionId,
      boardId: boardIdFromReturnTo(returnTo),
      userId: session.get("userId") ?? null,
    });
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

