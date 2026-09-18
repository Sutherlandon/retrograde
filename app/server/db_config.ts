// app/server/db_config.ts
// Every environment variable the app reads is read and validated here, once,
// when the server starts (CLAUDE.md rule 5, ADR-0018). A required variable
// that is missing, or any variable set to something malformed, exits the
// process with a FATAL message naming it — in every environment.
import { Pool } from "pg";

function fatal(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fatal(`missing required environment variable ${name}`);
  return value;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function requireUrlEnv(name: string): string {
  const value = requireEnv(name);
  if (!isHttpUrl(value)) fatal(`${name} must be an http(s) URL (got "${value}")`);
  return value;
}

// A strict boolean env var: unset, empty, or "false" is false and "true" is
// true. Any other value refuses to boot, so a typo can never silently pick a
// behavior the operator did not ask for.
function parseBooleanEnv(name: string): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  fatal(`${name} must be "true" or "false" (got "${raw}")`);
}

// Set by the tooling: `npm run dev` is development, `npm start` defaults to
// production, and the test runner sets test.
const NODE_ENVS = ["development", "production", "test"];

function parseNodeEnv(): string {
  const raw = process.env.NODE_ENV;
  if (raw && NODE_ENVS.includes(raw)) return raw;
  fatal(`NODE_ENV must be one of ${NODE_ENVS.join(", ")} (got ${raw === undefined ? "nothing" : `"${raw}"`})`);
}

export const nodeEnv = parseNodeEnv();
export const isProduction = nodeEnv === "production";

// Database: DATABASE_URL, or all four PG_* variables — never both, never part.
const PG_PART_VARS = ["PG_HOST", "PG_USER", "PG_PASSWORD", "PG_SCHEMA"];

function databaseConnectionString(): string {
  const url = process.env.DATABASE_URL;
  const setParts = PG_PART_VARS.filter((name) => process.env[name]);
  if (url && setParts.length > 0) {
    fatal(`set DATABASE_URL or the PG_* variables, not both (DATABASE_URL and ${setParts.join(", ")} are set)`);
  }
  if (url) {
    let protocol = "";
    try {
      protocol = new URL(url).protocol;
    } catch {
      // not a URL; reported below without echoing a value that may hold a password
    }
    if (protocol !== "postgres:" && protocol !== "postgresql:") {
      fatal("DATABASE_URL must be a postgres:// or postgresql:// URL");
    }
    return url;
  }
  const missing = PG_PART_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    fatal(`missing database configuration: set DATABASE_URL, or all of ${PG_PART_VARS.join(", ")} (missing ${missing.join(", ")})`);
  }
  const [host, user, password, database] = PG_PART_VARS.map((name) => process.env[name] ?? "");
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}`;
}

const connectionString = databaseConnectionString();

// TLS to the database everywhere except local development, with the server's
// certificate verified (ADR-0018). pg applies SSL parameters from the
// connection string over the pool's ssl option, so a URL that turns SSL off
// would silently win — refuse it wherever TLS is required.
const databaseTlsRequired = nodeEnv !== "development";

if (databaseTlsRequired) {
  const params = new URL(connectionString).searchParams;
  if (params.get("sslmode") === "disable") {
    fatal(`DATABASE_URL sets sslmode=disable, but the database connection must use TLS when NODE_ENV is ${nodeEnv}`);
  }
  const ssl = params.get("ssl");
  if (ssl === "0" || ssl === "false") {
    fatal(`DATABASE_URL sets ssl=${ssl}, but the database connection must use TLS when NODE_ENV is ${nodeEnv}`);
  }
}

function describeConnection(url: string): string {
  const { hostname, port, pathname, searchParams } = new URL(url);
  const params = [...searchParams.keys()];
  return `${hostname}${port ? `:${port}` : ""}${pathname}${params.length > 0 ? ` (parameters: ${params.join(", ")})` : ""}`;
}

console.log(
  `connecting to database ${describeConnection(connectionString)}; NODE_ENV=${nodeEnv}; TLS ${databaseTlsRequired ? "required" : "not required (development)"}`
);

export const pool = new Pool({
  connectionString,
  ssl: databaseTlsRequired ? { rejectUnauthorized: true } : false,
});

// Site admins: the OAuth `sub` values (users.external_id) that always have the
// admin dashboard and can grant other admins. At least one is required.
function parseSiteAdminIds(): string[] {
  const ids = requireEnv("SITE_ADMIN_IDS")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) fatal("SITE_ADMIN_IDS must list at least one OAuth sub");
  return ids;
}

export const siteAdminIds: string[] = parseSiteAdminIds();

// Signs the session cookie. Changing it signs everyone out.
export const sessionSecret = requireEnv("SESSION_SECRET");

// Deployment mode (ADR-0016). Unset or "false" is the hosted service, where
// the paid tier is bought through Stripe. "true" is a self-hosted instance,
// licensed outside Stripe: every account is tier 3, billing does not exist,
// and the dashboard is home with no marketing site (ADR-0017).
export const selfHosted = parseBooleanEnv("SELF_HOSTED");

// A self-hosted instance with Stripe configured is contradictory, and the
// likeliest way to get there is SELF_HOSTED set on the hosted deployment by
// mistake — which would hand every account the paid tier for free. Refuse.
const STRIPE_ENV_VARS = ["STRIPE_RESTRICTED_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"];
if (selfHosted) {
  const setStripeVars = STRIPE_ENV_VARS.filter((name) => process.env[name]);
  if (setStripeVars.length > 0) {
    fatal(
      `SELF_HOSTED=true but ${setStripeVars.join(", ")} ${setStripeVars.length === 1 ? "is" : "are"} set. ` +
        "A self-hosted instance takes no payments: unset the Stripe variables, or unset SELF_HOSTED for the hosted service."
    );
  }
}

// The likeliest self-hosted misconfiguration is an upgrade without SELF_HOSTED,
// which lands here first. Name the switch, so the operator is not sent off to
// acquire Stripe keys an instance they license outside Stripe never needs.
function requireStripeEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    fatal(
      `missing required environment variable ${name} ` +
        "(required on the hosted service; set SELF_HOSTED=true for a self-hosted instance)"
    );
  }
  return value;
}

// Stripe (GAP-005 / ADR-0013): restricted API key, webhook signing secret,
// and the one recurring Price backing the paid tier. Required on the hosted
// service; null on a self-hosted instance, which has no billing (ADR-0016).
export const stripeRestrictedKey: string | null = selfHosted ? null : requireStripeEnv("STRIPE_RESTRICTED_KEY");
export const stripeWebhookSecret: string | null = selfHosted ? null : requireStripeEnv("STRIPE_WEBHOOK_SECRET");
export const stripePriceId: string | null = selfHosted ? null : requireStripeEnv("STRIPE_PRICE_ID");

// Shared secret for the scheduled cleanup (app/routes/api/cron.archive-stale.ts,
// ADR-0005), which Vercel's cron sends with every invocation. A self-hosted
// instance runs no scheduled cleanup (ADR-0020), so there it is refused like
// the Stripe variables rather than sitting set and unused.
if (selfHosted && process.env.CRON_SECRET) {
  fatal(
    "SELF_HOSTED=true but CRON_SECRET is set. A self-hosted instance runs no scheduled cleanup: " +
      "unset CRON_SECRET, or unset SELF_HOSTED for the hosted service."
  );
}

export const cronSecret: string | null = selfHosted ? null : requireEnv("CRON_SECRET");

// OAuth client (the identity provider's authorization code flow).
export const oauthClientId = requireEnv("OAUTH_CLIENT_ID");
export const oauthClientSecret = requireEnv("OAUTH_CLIENT_SECRET");
export const oauthScopes = requireEnv("OAUTH_SCOPES");
export const oauthAuthorizationUrl = requireUrlEnv("OAUTH_AUTHORIZATION_URL");
export const oauthTokenUrl = requireUrlEnv("OAUTH_TOKEN_URL");
export const oauthUserinfoUrl = requireUrlEnv("OAUTH_USERINFO_URL");

// OAuth redirect URI. An unnamed Vercel preview deployment gets a throwaway
// hostname, so its callback is built from VERCEL_URL — which must then be
// present, or sign-in callbacks would go to some other deployment. Everywhere
// else it is the stable OAUTH_REDIRECT_URI: local development, Vercel
// production, and any named Vercel environment such as staging, which keeps one
// domain and one registered callback. VERCEL_ENV reports "preview" for a named
// environment too, so VERCEL_TARGET_ENV — the environment's own name — is what
// tells them apart (ADR-0023).
function parseOauthRedirectUri(): string {
  const target = process.env.VERCEL_TARGET_ENV ?? process.env.VERCEL_ENV;
  if (target === "preview") {
    const host = process.env.VERCEL_URL;
    if (!host) fatal("VERCEL_ENV is preview but VERCEL_URL is not set, so this deployment's OAuth callback URL is unknown");
    return `https://${host}/auth/callback`;
  }
  return requireUrlEnv("OAUTH_REDIRECT_URI");
}

export const oauthRedirectUri = parseOauthRedirectUri();

// PORT is read by react-router-serve, which falls back to port 3000 (or any
// free port) when the value is not a number. Validate it here, where startup
// can still stop, so a typo is not a server listening somewhere unexpected.
function validatePort(): void {
  const raw = process.env.PORT;
  if (raw === undefined || raw === "") return;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
    fatal(`PORT must be a whole number from 1 to 65535 (got "${raw}")`);
  }
}

validatePort();

// Deployment presentation (ADR-0017). Anything a deployment would otherwise
// change in source is read here instead, so no customer edits code.

// Hide the logout control — for SSO deployments that sign users straight back
// in, where logging out only bounces the user back to where they were.
export const hideLogout = parseBooleanEnv("HIDE_LOGOUT");

// The profile field shown as a user's username. The OAuth callback stores only
// these fields, so any other value would show everyone as "Guest" — refuse it.
const USERNAME_FIELDS = ["preferred_username", "email", "name", "given_name", "family_name"];

function parseUsernameField(): string {
  const raw = process.env.OAUTH_USERNAME_FIELD;
  if (!raw) return "preferred_username";
  if (USERNAME_FIELDS.includes(raw)) return raw;
  fatal(`OAUTH_USERNAME_FIELD must be one of ${USERNAME_FIELDS.join(", ")} (got "${raw}")`);
}

export const oauthUsernameField = parseUsernameField();

// Where logout sends the browser: an http(s) URL, such as the identity
// provider's end-session endpoint, or a path on this instance. A
// protocol-relative "//host" is refused because a browser treats it as another
// site.
function parseLogoutRedirectUrl(): string {
  const raw = process.env.OAUTH_LOGOUT_REDIRECT_URL;
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (isHttpUrl(raw)) return raw;
  fatal(`OAUTH_LOGOUT_REDIRECT_URL must be an http(s) URL or a path starting with "/" (got "${raw}")`);
}

export const oauthLogoutRedirectUrl = parseLogoutRedirectUrl();

export interface SiteLogo {
  light: string;
  dark: string;
  alt: string;
}

// An optional deployment logo shown beside the Retrograde mark. The header
// needs a light and a dark variant for theming and alt text for
// accessibility, so the three variables are all-or-nothing.
function parseSiteLogo(): SiteLogo | null {
  const light = process.env.SITE_LOGO_LIGHT_URL;
  const dark = process.env.SITE_LOGO_DARK_URL;
  const alt = process.env.SITE_LOGO_ALT;
  if (!light && !dark && !alt) return null;
  if (light && dark && alt) return { light, dark, alt };
  const missing = [
    ["SITE_LOGO_LIGHT_URL", light],
    ["SITE_LOGO_DARK_URL", dark],
    ["SITE_LOGO_ALT", alt],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  fatal(
    `incomplete site logo (missing ${missing.join(", ")}): the light URL, dark URL and alt text are set together or not at all`
  );
}

export const siteLogo = parseSiteLogo();

// What the browser needs to know about the deployment. process.env does not
// exist on the client, so each layout loader passes this down to the header.
export interface HostingConfig {
  selfHosted: boolean;
  hideLogout: boolean;
  siteLogo: SiteLogo | null;
}

export const hostingConfig: HostingConfig = { selfHosted, hideLogout, siteLogo };
