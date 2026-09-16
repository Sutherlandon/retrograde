# Retrograde

Retrograde is mission control for retrospectives: collaborative boards with sticky notes, voting, timers and action items, shared by people and AI agents. It runs as a hosted service at [retrograde.sh](https://retrograde.sh), or on your own infrastructure.

This README is the self-hosting guide. If you are working on the code, start with [`CLAUDE.md`](CLAUDE.md) and [`docs/STATE.md`](docs/STATE.md).

## Self-hosting

A self-hosted instance is one Node.js server backed by PostgreSQL, with sign-in through your own OpenID Connect provider. Every account on it gets the full product — named crews, members-only boards, crew action items and AI crewmates — with no billing. You configure it entirely through environment variables; you never edit source code.

### What you need

- **Node.js 20**, or Docker. The Docker image is built on `node:20-alpine`.
- **PostgreSQL with TLS enabled.** Retrograde always connects over TLS and verifies the server's certificate. It creates and upgrades its own schema every time it starts, so its database user needs permission to create and alter tables.
- **An OpenID Connect provider** (Keycloak, Okta, Microsoft Entra ID, Auth0, …) that supports the authorization code flow with a client secret and has a userinfo endpoint.
- **HTTPS in front of the app.** The server runs in production mode, where the session cookie is marked `Secure`. Over plain HTTP, browsers drop that cookie and nobody stays signed in.
- **A scheduler** such as cron or a Kubernetes CronJob, for one request a day. See [Scheduled cleanup](#scheduled-cleanup).

### 1. Register Retrograde with your identity provider

Create a confidential client with:

- **Redirect URI:** `https://retro.example.com/auth/callback`
- **Scopes:** `openid profile email`
- **Grant type:** authorization code

At sign-in Retrograde reads these userinfo claims: `sub` (the stable account id), `email`, `email_verified`, `name`, `given_name`, `family_name`, and `nickname` or `preferred_username`.

### 2. Configure the environment

Retrograde does not read a `.env` file itself. Pass variables through your process manager, `docker run --env-file`, or your orchestrator's secrets.

**Required**

| Variable | Value |
|---|---|
| `SELF_HOSTED` | `true` |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:5432/DATABASE`. The connection always uses TLS, and the database server's certificate must be trusted by this machine's CA store. For a private CA, append `?sslrootcert=/path/to/ca.pem` (in Docker, mount that file into the container). `?sslmode=no-verify` encrypts without checking the certificate; `sslmode=disable` is refused. Instead of `DATABASE_URL` you can set all four of `PG_HOST`, `PG_USER`, `PG_PASSWORD` and `PG_SCHEMA` (the database name) — not both. |
| `SESSION_SECRET` | A long random string that signs session cookies, for example the output of `openssl rand -hex 32`. Changing it signs everyone out. |
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | From your identity provider. |
| `OAUTH_AUTHORIZATION_URL`, `OAUTH_TOKEN_URL`, `OAUTH_USERINFO_URL` | Your provider's endpoints, listed in its `/.well-known/openid-configuration`. |
| `OAUTH_REDIRECT_URI` | `https://retro.example.com/auth/callback`. It must match the provider's setting exactly. |
| `OAUTH_SCOPES` | `openid profile email` |
| `CRON_SECRET` | A long random string that authorizes the [scheduled cleanup](#scheduled-cleanup) request. |
| `SITE_ADMIN_IDS` | Comma-separated `sub` values of the accounts that administer this instance — at least one. |

**Must not be set:** `STRIPE_RESTRICTED_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`. A self-hosted instance takes no payments, and startup refuses to continue if any of them is present.

**Optional**

| Variable | Default | Value |
|---|---|---|
| `PORT` | `3000` | Port the server listens on, 1–65535. |
| `NODE_ENV` | `production` | Leave it unset. `development` turns off TLS to the database and the `Secure` session cookie, and is only for local development. |
| `HOST` | all interfaces | Interface to bind to. |
| `HIDE_LOGOUT` | `false` | `true` hides the logout button. Use it when your provider signs people straight back in, which makes logging out pointless. |
| `OAUTH_LOGOUT_REDIRECT_URL` | `/` | Where the browser goes after logging out: an `http(s)` URL, such as your provider's end-session endpoint, or a path on this instance. |
| `OAUTH_USERNAME_FIELD` | `preferred_username` | Which stored profile field is shown as a person's name in Retrograde: `preferred_username`, `email`, `name`, `given_name` or `family_name`. |
| `SITE_LOGO_LIGHT_URL`, `SITE_LOGO_DARK_URL`, `SITE_LOGO_ALT` | none | Your logo beside the Retrograde mark, as a light-theme image, a dark-theme image and alt text. Set all three or none. See [Branding](#branding). |

Startup checks every variable: a required one that is missing, or any value that is malformed, stops the server with a message naming it.

### 3. Run it

**With Docker**, from a checkout of this repository:

```bash
docker build -t retrograde .
docker run -d --name retrograde -p 3000:3000 --env-file retrograde.env retrograde
```

Write `retrograde.env` as plain `NAME=value` lines. Docker does not strip quotes, so do not quote the values.

**Without Docker**, with the variables exported in your shell or service definition:

```bash
npm ci
npm run build
npm start
```

Either way, put your HTTPS proxy or load balancer (nginx, Caddy, a cloud load balancer) in front of the port and point it at `GET /healthcheck`, which answers `200 OK`.

### 4. Confirm it started

If a setting is missing, malformed or contradictory, the server logs a line beginning `FATAL:` that names the variable, then exits. The common ones:

| Message | Fix |
|---|---|
| `missing required environment variable STRIPE_… (… set SELF_HOSTED=true …)` | Set `SELF_HOSTED=true`. |
| `missing required environment variable …` | Set the variable it names. |
| `missing database configuration …` | Set `DATABASE_URL`, or all four `PG_*` variables. |
| `could not connect to the database` | Check the host and credentials, and that the database accepts TLS with a certificate this server trusts. |
| `SELF_HOSTED=true but STRIPE_… is set` | Remove the Stripe variables. |
| `incomplete site logo (missing …)` | Set all three `SITE_LOGO_*` variables, or none. |

Then open `https://retro.example.com/`. On a self-hosted instance `/` goes straight to the dashboard, which sends you to your provider to sign in.

### Scheduled cleanup

Boards created without signing in, and not in any crew, are archived 30 days after they were created. Boards in a crew are never archived, and neither are boards created before 22 June 2026. The hosted service runs this on Vercel's scheduler; on your instance, send one request a day:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://retro.example.com/api/v1/cron/archive-stale
```

It responds with `{"archived": N}`. POST works too, for a scheduler that prefers it. If you never schedule it, those boards simply stay open.

### Branding

The `SITE_LOGO_*` URLs are fetched by your users' browsers, so they must be reachable from wherever your users are. Host the images anywhere, or put them in the app's static directory: files under `build/client` are served from `/`, so `build/client/branding/logo-light.svg` is available at `/branding/logo-light.svg` without rebuilding. In Docker, mount a directory there:

```bash
docker run -d --name retrograde -p 3000:3000 --env-file retrograde.env \
  -v /srv/retrograde/branding:/app/build/client/branding:ro retrograde
```

with `SITE_LOGO_LIGHT_URL=/branding/logo-light.svg` and `SITE_LOGO_DARK_URL=/branding/logo-dark.svg`.

### How a self-hosted instance differs from the hosted service

- **Everyone gets every feature.** Any account can create named crews, and crews never freeze for lack of a subscription. Each account's personal crew still holds one AI crewmate key, as it does for a paying account on the hosted service; more come from named crews.
- **No billing.** The billing pages and the Stripe webhook return `404`, and there is no subscribe prompt.
- **No marketing site.** `/`, `/about`, `/contact`, `/terms-of-service` and `/privacy-policy` redirect to the dashboard, `/sitemap.xml` returns `404`, and the header has no About or Contact links.
- **No Vercel Analytics.** The instance never loads Vercel's analytics script.

Access works the same way in both. Anyone who can reach the instance and has a board's link can open that board and take part without signing in, unless the board belongs to a named crew — those are members-only by default. If boards must not be reachable by people outside your organization, keep the instance on your private network.

### Upgrading

Replace the image or the build and restart. Your configuration lives in the environment, so nothing needs to be re-applied. Retrograde upgrades its database schema when it starts, so **back up the database before upgrading**.

**From 1.x to 2.0:**

- Set `SELF_HOSTED=true` and `SITE_ADMIN_IDS`, make sure every required variable above is set, and make sure your database accepts TLS connections. 2.0 refuses to start otherwise.
- `app/config/siteConfig.ts` no longer exists. Drop any edits you made to it and use environment variables instead:

  | 1.x edit to `siteConfig.ts` | 2.0 environment |
  |---|---|
  | `dashboardHome: true` | `SELF_HOSTED=true`, plus `HIDE_LOGOUT=true` if you relied on it to hide logout |
  | `usernameField` | `OAUTH_USERNAME_FIELD` |
  | `logoLight`, `logoDark`, `logoAlt` imports | `SITE_LOGO_LIGHT_URL`, `SITE_LOGO_DARK_URL`, `SITE_LOGO_ALT` |

- If you set `LOGOUT_REDIRECT_URL`, rename it to `OAUTH_LOGOUT_REDIRECT_URL`.

## Project docs

- [`docs/STATE.md`](docs/STATE.md) — the current project snapshot: what's shipped and known rough edges.
- [`docs/adr/`](docs/adr/) — Architecture Decision Records: the decisions that shape the product and architecture, and why.
- [`docs/spec/0001-action-registry.md`](docs/spec/0001-action-registry.md) — every action in the product, who may take it, and what enforces that.
- [`docs/AI_AGENT_API.md`](docs/AI_AGENT_API.md) — JSON API reference for AI agents.
- [`CLAUDE.md`](CLAUDE.md) — engineering rules, architecture and conventions for contributors.
