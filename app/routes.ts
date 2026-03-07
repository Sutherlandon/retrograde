import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  /* Site Pages — optional auth, shows user profile if logged in */
  layout("components/SiteLayout.tsx", [
    index("routes/site/home.tsx"),
    route("/terms-of-service", "routes/site/terms-of-service.tsx"),
    route("/privacy-policy", "routes/site/privacy-policy.tsx"),
    route("/about", "routes/site/about.tsx"),
    route("/contact", "routes/site/contact.tsx"),
  ]),

  /* Non-layout routes */
  route("/healthcheck", "routes/healthcheck.tsx"),
  route("/sitemap.xml", "routes/sitemap.ts"),
  route("/login", "routes/site/login.tsx"),

  /* App Routes — require authentication */
  route("/app", "components/AppLayout.tsx", [
    route("dashboard", "routes/app/dashboard.tsx"),
    route("board/claim", "routes/app/board.claim.ts"),
  ]),

  /* Board Routes — authentication optional (anonymous access) */
  route("/app/board/:id", "components/BoardLayout.tsx", [
    index("routes/app/board.tsx"),

    // Resource routes — actions only, no UI
    route("title", "routes/app/board.title.ts"),
    route("columns", "routes/app/board.columns.ts"),
    route("notes", "routes/app/board.notes.ts"),
    route("timer", "routes/app/board.timer.ts"),
    route("poll", "routes/app/board.poll.ts"),
  ]),

  /* Api Routes */
  route("/auth/login", "routes/auth/login.ts"),
  route("/auth/callback", "routes/auth/callback.ts"),
  route("/auth/logout", "routes/auth/logout.ts"),

  // legacy route for backward compatibility
  route("/board/:id", "routes/app/board.legacy.tsx"),

] satisfies RouteConfig;
