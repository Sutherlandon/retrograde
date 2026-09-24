import { createCookieSessionStorage } from "react-router";
import { isProduction, sessionSecret } from "~/server/db_config";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    sameSite: "lax",
    // Production is served over HTTPS; a browser drops a Secure cookie over plain HTTP.
    secure: isProduction,
    secrets: [sessionSecret],
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export const {
  getSession,
  commitSession,
  destroySession,
} = sessionStorage;
