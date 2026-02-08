import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  /* Site Pages */
  index("routes/home.tsx"),
  route("/terms-of-service", "routes/terms-of-service.tsx"),
  route("/privacy-policy", "routes/privacy-policy.tsx"),
  route("/about", "routes/about.tsx"),
  route("/contact", "routes/contact.tsx"),
  route("/healthcheck", "routes/healthcheck.tsx"),
  route("/sitemap.xml", "routes/sitemap.ts"),

  /* App Routes */
  route("/app", "components/AppLayout.tsx", [
    route("board/:id", "routes/board.tsx"),
  ]),

  /* Api Routes */
  route("auth/login", "routes/auth/login.ts"),
  route("auth/callback", "routes/auth/callback.ts"),

  // legacy route for backward compatibility
  route("/board/:id", "routes/board-legacy.tsx"),

] satisfies RouteConfig;
