# ADR-0018: Every setting is validated at startup, and the database uses TLS outside local development

## Status

Accepted (2026-09-15) — supersedes the note in [ADR-0013](0013-stripe-subscriptions.md) §5 that `SITE_ADMIN_IDS` stays a warning. Extends [ADR-0017](0017-deployment-configured-by-environment.md). The Stripe rules in ADR-0013 and ADR-0016 are unchanged. `CRON_SECRET` now follows those Stripe rules — required on the hosted service, refused on a self-hosted instance ([ADR-0020](0020-self-hosted-instances-run-no-scheduled-cleanup.md)). The schema build that makes the startup connection now also gates every query ([ADR-0024](0024-queries-wait-for-the-schema-build.md)).

## Context

CLAUDE.md rule 5 says configuration fails loudly at startup, but only some variables followed it. `SESSION_SECRET` and the OAuth client variables were read with a TypeScript `!` where they were used, so a missing one broke sign-in at runtime. A missing database variable was interpolated into the connection string as the text `undefined`. `SITE_ADMIN_IDS` printed a warning and carried on. `NODE_ENV` was never checked, and a mistyped `PORT` made `react-router-serve` quietly listen on a different port.

The database connection had its own gap. `db_config.ts` computed an SSL flag from `NODE_ENV` and never passed it to the pool, so a connection used TLS only when its URL happened to ask for it. `pg` also applies SSL parameters from the connection string over the pool's `ssl` option, so a URL can switch TLS off no matter what the code sets. And `initializeDatabase` called `pool.connect()` outside its `try`, so a failed connection surfaced as an unhandled promise rejection rather than a clear failure.

## Decision

### 1. Every variable the app reads is validated when the server starts

All of them are read in `app/server/db_config.ts`, nowhere else. A required variable that is missing, or any variable set to something malformed, exits the process with a `FATAL:` message naming it. Nothing warns and carries on, and no variable is read with `process.env.X!` at its point of use.

- **Required:** the database configuration; `SESSION_SECRET`; `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` and `OAUTH_SCOPES`; `OAUTH_AUTHORIZATION_URL`, `OAUTH_TOKEN_URL` and `OAUTH_USERINFO_URL`, each an `http(s)` URL; `OAUTH_REDIRECT_URI`, an `http(s)` URL, except on a Vercel preview, where it is built from `VERCEL_URL` and `VERCEL_URL` must be set; `CRON_SECRET`; `SITE_ADMIN_IDS`, with at least one id; and `NODE_ENV`, which must be `development`, `production` or `test`.
- **Optional, validated when set:** `PORT` (1–65535), `SELF_HOSTED`, `HIDE_LOGOUT`, `OAUTH_USERNAME_FIELD`, `OAUTH_LOGOUT_REDIRECT_URL` and `SITE_LOGO_*`.
- **Stripe:** as ADR-0013 and ADR-0016 set out — required on the hosted service, refused when `SELF_HOSTED=true`.

`SITE_ADMIN_IDS` is required because an instance nobody can administer is a misconfiguration, not a supported state.

### 2. The database is configured one way at a time

Either `DATABASE_URL`, which must be a `postgres://` or `postgresql://` URL, or all four of `PG_HOST`, `PG_USER`, `PG_PASSWORD` and `PG_SCHEMA`. Both at once, or only some of the `PG_*` variables, refuses to boot. Credentials from the `PG_*` variables are URL-encoded into the connection string.

### 3. The database connection uses TLS everywhere except local development

When `NODE_ENV` is not `development`, the pool connects with `ssl: { rejectUnauthorized: true }`: the connection is encrypted and the server's certificate must chain to a trusted CA. That covers the hosted service on Vercel, any self-hosted instance, and `npm start` anywhere. `npm run dev` sets `NODE_ENV=development` and does not force TLS.

- Because a connection string's SSL parameters override the pool's option, `sslmode=disable`, `ssl=0` and `ssl=false` in `DATABASE_URL` refuse to boot wherever TLS is required.
- Other connection-string SSL parameters still apply. `sslrootcert=/path/to/ca.pem` trusts a private CA. `sslmode=no-verify` is an explicit choice to encrypt without verifying the certificate.

### 4. Startup exits when it cannot reach the database

`initializeDatabase` catches a failed connection — a bad host, bad credentials, or a TLS failure — logs `FATAL: could not connect to the database` with the error, and exits.

## Consequences

**Positive**
- A misconfiguration cannot produce a server that starts and then fails requests. It stops at boot, naming the variable.
- Database traffic is encrypted and the server is authenticated by default on every deployment, with no URL parameter to remember.

**Negative / load-bearing**
- `npm run dev` now needs every required variable too, including `SITE_ADMIN_IDS` and all the OAuth settings.
- Running the production build against a local Postgres without TLS fails. Develop locally with `npm run dev`.
- A database with a self-signed or privately issued certificate needs `sslrootcert` in its URL, or an explicit `sslmode=no-verify`.
- Every deployment must set `SITE_ADMIN_IDS` before this version will start, the hosted service included.

## Alternatives Considered

1. **Decide "local" by the database host being `localhost`.** Rejected. A self-hosted instance with Postgres on the same machine would connect without TLS, and the environment already says whether this is local development.
2. **Leave TLS to a `?sslmode=require` in the URL.** Rejected. Forgetting it silently sends credentials and data in plaintext.
3. **libpq's `sslmode=require` semantics — encrypt without verifying — as the default.** Not adopted. Verification is what stops a man-in-the-middle, and the installed `pg` already verifies for `sslmode=require`.
4. **Keep `SITE_ADMIN_IDS` optional with a warning.** Rejected. A warning in a boot log is exactly the failure mode rule 5 exists to prevent.

## References

- CLAUDE.md rule 5; ADR-0013 §5; ADR-0016; ADR-0017.
- `app/server/db_config.ts`, `app/server/db_init.ts`, `app/session.server.ts`, `app/routes/auth/login.ts`, `app/routes/auth/callback.ts`, `README.md`.
