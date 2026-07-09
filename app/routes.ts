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
/* App Routes — require authentication */
  route("/app", "components/AppLayout.tsx", [
    route("dashboard", "routes/app/dashboard.tsx"),
    route("board/claim", "routes/app/board.claim.ts"),
    route("admin/dashboard", "routes/app/admin.dashboard.tsx"),
    route("admin/admins",   "routes/app/admin.admins.ts"),
    route("account/api-keys", "routes/app/account.api-keys.tsx"),
    route("teams", "routes/app/teams.tsx"),
    route("teams/:id", "routes/app/teams.$id.tsx"),
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
    route("settings", "routes/app/board.settings.ts"),
    route("attachments", "routes/app/board.attachments.ts"),
    route("facilitators", "routes/app/board.facilitators.ts"),
    route("action-items", "routes/app/board.action-items.ts"),
  ]),

  /* Api Routes */
  route("/auth/login", "routes/auth/login.ts"),
  route("/auth/callback", "routes/auth/callback.ts"),
  route("/auth/logout", "routes/auth/logout.ts"),

  /* JSON API — agent-facing */
  route("/api/v1/boards", "routes/api/boards.ts"),
  route("/api/v1/boards/:id", "routes/api/board.ts"),
  route("/api/v1/boards/:id/notes", "routes/api/board.notes.ts"),
  route("/api/v1/boards/:id/action-items", "routes/api/board.action-items.ts"),
  route("/api/v1/cron/archive-stale", "routes/api/cron.archive-stale.ts"),

  // legacy route for backward compatibility
  route("/board/:id", "routes/app/board.legacy.tsx"),

] satisfies RouteConfig;
