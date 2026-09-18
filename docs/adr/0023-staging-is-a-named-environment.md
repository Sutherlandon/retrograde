# ADR-0023: Staging is a named environment; previews stay throwaway

## Status

Accepted (2026-09-18) — extends [ADR-0018](0018-every-setting-validated-and-database-tls.md) §1, which read the OAuth callback from `VERCEL_URL` on every Vercel deployment that is not production.

## Context

Stripe's webhook, and Auth0's allowed callback list, both need a URL registered in advance. A Vercel preview deployment gets a hostname derived from the branch and build, so neither can be configured against one. That left no environment where the whole loop — sign in through Auth0, subscribe through Stripe, entitlement written by the webhook, read back by the app — could be exercised before production, and production is not the place to discover that a webhook was never created.

Vercel assigns custom domains to a branch, so "point this domain at the latest preview" is not a thing the platform does. Its answer is a named environment tracking a long-lived branch.

Two platform behaviors make that harder than it sounds. A named environment still reports `VERCEL_ENV=preview`, so the app would have built its OAuth callback from the throwaway hostname and dropped the session on a domain the user never visited. And Vercel protects non-production deployments with its own login wall, which answers Stripe's webhook with an HTML login page.

## Decision

### 1. Staging is a Vercel custom environment named `staging`, tracking a `staging` branch

It holds one stable domain, `staging.retrograde.sh`, its own Neon branch, its own Auth0 application, and Stripe in a sandbox. It is the environment where a release is exercised end to end.

### 2. Preview deployments stay throwaway

No Auth0 application, no Stripe webhook, no stable domain. A preview is for looking at a branch. Deployment protection stays on for them.

### 3. The OAuth callback is generated only for an unnamed preview

`db_config.ts` reads `VERCEL_TARGET_ENV`, the environment's own name, falling back to `VERCEL_ENV`. Only the value `preview` builds the callback from `VERCEL_URL`. Every named environment — `production`, `staging`, or any added later — uses the configured `OAUTH_REDIRECT_URI`, which is then required as everywhere else.

### 4. Deployment protection is off for staging, and nothing is bypassed

Vercel offers a bypass token that third parties can carry in a query parameter. It is not used. Staging exists to prove the real thing works: Stripe's signature check, Auth0's callback, and the app's own guards all run exactly as they do in production. The cost is that staging is publicly reachable, which is why it uses a Stripe sandbox and a database of its own.

## Consequences

**Positive**
- One URL to register with Stripe and Auth0, set once, stable across deploys.
- The paid path is provable before release: a sandbox subscription writes `subscription_status` through a real webhook.
- Previews keep costing nothing to maintain.

**Negative / load-bearing**
- Staging is public. It must never hold real customer data or a live Stripe key.
- A fourth copy of every secret. `docs/DEPLOYMENT.md` is where that matrix lives.
- `VERCEL_TARGET_ENV` is a Vercel-specific variable. Off Vercel it is unset and the fallback leaves behavior unchanged.
- Adding another named environment means another Auth0 callback and, if it needs billing, another Stripe endpoint.

## Alternatives Considered

1. **Alias the newest preview to a fixed domain from CI.** Rejected: with two PRs building, the domain's target is whichever finished last, so a webhook could land on unrelated code.
2. **A second Vercel project whose production branch is `staging`.** Rejected: it reports `VERCEL_ENV=production` and needs no code change, but duplicates every project setting and every variable, and the two drift.
3. **Vercel's protection bypass token in the Stripe URL.** Rejected: it works, but it puts a secret in a webhook URL and makes staging's request path differ from production's, which is the one thing staging exists to match.
4. **Test the webhook only locally with `stripe listen`.** Kept for local development, rejected as the whole answer: it never exercises Auth0, Neon, and Stripe together on a deployed instance.

## References

- ADR-0013 (the webhook is the source of truth), ADR-0018 (startup validation), ADR-0016/0020 (what a self-hosted instance does not have).
- `app/server/db_config.ts` (`parseOauthRedirectUri`), `docs/DEPLOYMENT.md`.
