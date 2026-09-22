# ADR-0025: Staging is its own Vercel project

## Status

Accepted (2026-09-21) — supersedes [ADR-0023](0023-staging-is-a-named-environment.md) §1 and §4, and the mechanism in its status note. ADR-0023 §2 (previews stay throwaway) and §3 (only an unnamed preview generates its OAuth callback) stand.

## Context

ADR-0023 put staging in a Vercel custom environment of the `retrograde` project and relied on the project's deployment protection, `all_except_custom_domains`, to leave `staging.retrograde.sh` reachable. That was wrong. The setting exempts **production's** custom domains only; a custom environment counts as a preview. Every request to staging, `/healthcheck` included, was answered with a redirect to Vercel's login, so Stripe's webhook could never reach the app.

The ways out were: turn Vercel Authentication off for the whole project, which would also expose every preview; buy protection exceptions for one domain; put a bypass token in Stripe's webhook URL, which ADR-0023 had already rejected; or make staging a production deployment of its own project, whose custom domain the existing setting already exempts.

## Decision

1. **Staging is the Vercel project `retrograde-staging`,** built from the same repository, with `staging` as its production branch and `staging.retrograde.sh` as its domain.
2. **Deployment protection stays as it is on both projects.** Production custom domains are exempt; generated `*.vercel.app` URLs and every preview stay behind Vercel's login. Nothing is bypassed.
3. **Staging has its own configuration:** its own Neon database, its own `SESSION_SECRET` and `CRON_SECRET`, the Stripe sandbox, and the same Auth0 application with `https://staging.retrograde.sh/auth/callback` added to its callbacks. Every variable is scoped to that project's Production environment.
4. **The `staging` custom environment in `retrograde` is retired.**

## Consequences

**Positive**
- Stripe's webhook and Auth0's callback reach staging exactly as they reach production, with no token in any URL.
- Previews keep Vercel's login wall.
- Staging runs as production in every respect the platform controls, which is the point of staging.

**Negative / load-bearing**
- Two projects to keep in step. A variable added to production must be added to `retrograde-staging` too; `docs/DEPLOYMENT.md` holds the matrix.
- Staging is public and runs Vercel's cron daily, so its own old crewless boards are archived, and Vercel Analytics loads there. It must never hold real customer data or a live Stripe key.
- `VERCEL_ENV` and `VERCEL_TARGET_ENV` are both `production` on staging. The app cannot tell staging from production by those, and does not need to: everything that differs is configuration.

## Alternatives Considered

1. **Turn Vercel Authentication off.** Rejected: it opens every preview, and previews may carry branched copies of production data.
2. **Deployment protection exceptions for `staging.retrograde.sh`.** Not adopted: a paid add-on to do what a second project does free.
3. **A bypass token in the Stripe webhook URL.** Rejected, as in ADR-0023: a secret in a URL, and a request path production does not have.

## References

- ADR-0023 (the environment model this replaces), ADR-0013 (the webhook is the source of truth), ADR-0024 (the schema build that the first staging deploy exposed).
- `docs/DEPLOYMENT.md`.
