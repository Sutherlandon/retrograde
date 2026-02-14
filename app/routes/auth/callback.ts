import { redirect } from "react-router";
import { getSession, commitSession } from "~/session.server";
import { pool } from "~/server/db_config";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    throw new Response("Missing code or state", { status: 400 });
  }

  const session = await getSession(request.headers.get("Cookie"));
  const sessionState = session.get("oauth_state");

  // If we've already completed OAuth, just redirect safely
  if (!sessionState) {
    return redirect("/", {
      headers: {
        "Set-Cookie": await commitSession(session),
      },
    });
  }

  // validate that the state matches what we set in the session to prevent CSRF
  if (session.get("oauth_state") !== state) {
    throw new Response("Invalid OAuth state", { status: 400 });
  }

  session.unset("oauth_state");

  // 1. Exchange code for token
  const tokenRes = await fetch(process.env.OAUTH_TOKEN_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.OAUTH_REDIRECT_URI!,
      client_id: process.env.OAUTH_CLIENT_ID!,
      client_secret: process.env.OAUTH_CLIENT_SECRET!,
    }),
  });

  const token = await tokenRes.json();

  // 2. Fetch user profile
  const profileRes = await fetch(process.env.OAUTH_USERINFO_URL!, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
    },
  });

  const profile = await profileRes.json();

  console.log("User profile:", profile);

  // 3. Upsert user
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      INSERT INTO users (external_id, email, name, preferred_username, given_name, family_name, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (external_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        preferred_username = EXCLUDED.preferred_username,
        given_name = EXCLUDED.given_name,
        family_name = EXCLUDED.family_name,
        email_verified = EXCLUDED.email_verified,
        updated_at = NOW()
      RETURNING id;
      `,
      [
        profile.sub,
        profile.email,
        profile.name,
        profile.nickname || profile.preferred_username,
        profile.given_name,
        profile.family_name,
        profile.email_verified,
      ]
    );

    session.set("userId", result.rows[0].id);
  } finally {
    client.release();
  }

  const stateJson = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
  return redirect(stateJson.returnTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}
