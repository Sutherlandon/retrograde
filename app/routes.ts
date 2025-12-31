import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/board/:id", "routes/board.tsx"),
  route("/healthcheck", "routes/healthcheck.tsx"),
  route("/terms-of-service", "routes/terms-of-service.tsx"),
  route("/privacy-policy", "routes/privacy-policy.tsx"),
  route("/about", "routes/about.tsx"),
  route("/contact", "routes/contact.tsx"),
] satisfies RouteConfig;
