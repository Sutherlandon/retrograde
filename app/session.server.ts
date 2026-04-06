import { createCookieSessionStorage } from "react-router";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    secrets: [process.env.SESSION_SECRET!],
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
});

export const {
  getSession,
  commitSession,
  destroySession,
} = sessionStorage;
