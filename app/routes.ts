import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  /* Site Pages */
  index("routes/site/home.tsx"),
  route("/terms-of-service", "routes/site/terms-of-service.tsx"),
  route("/privacy-policy", "routes/site/privacy-policy.tsx"),
  route("/about", "routes/site/about.tsx"),
  route("/contact", "routes/site/contact.tsx"),
  route("/healthcheck", "routes/healthcheck.tsx"),
  route("/sitemap.xml", "routes/sitemap.ts"),
  route("/login", "routes/site/login.tsx"),

  /* App Routes */
  route("/app", "components/AppLayout.tsx", [
    route("dashboard", "routes/app/dashboard.tsx"),
    route("board/claim", "routes/app/board.claim.ts"),
    route("board/:id", "routes/app/board.tsx"),

    // Resource routes — actions only, no UI, no layout wrapping
    route("board/:id/columns", "routes/app/board.columns.ts"),
    route("board/:id/notes", "routes/app/board.notes.ts"),
    route("board/:id/timer", "routes/app/board.timer.ts"),
  ]),

  /* Api Routes */
  route("/auth/login", "routes/auth/login.ts"),
  route("/auth/callback", "routes/auth/callback.ts"),

  // legacy route for backward compatibility
  route("/board/:id", "routes/app/board.legacy.tsx"),

] satisfies RouteConfig;
