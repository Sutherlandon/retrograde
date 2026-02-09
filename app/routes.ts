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

  /* App Routes */
  route("/app", "components/AppLayout.tsx", [
    route("board/:id", "routes/app/board.tsx"),
  ]),

  /* Api Routes */
  route("auth/login", "routes/auth/login.ts"),
  route("auth/callback", "routes/auth/callback.ts"),

  // legacy route for backward compatibility
  route("/board/:id", "routes/app/board-legacy.tsx"),

] satisfies RouteConfig;
