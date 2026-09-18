# Deployment — providers, environments, and what holds which secret

Where the hosted service runs and how its environments differ. For *what* the
product does see [`spec/0001-action-registry.md`](spec/0001-action-registry.md);
for *why* decisions were made see [`adr/`](adr/README.md). Operators running
their own instance want [`../README.md`](../README.md) instead — a self-hosted
install touches none of the providers below except its own database and
identity provider.

Every variable named here is read and validated in `app/server/db_config.ts`.
Nothing else in the app reads `process.env`.

---

## Providers

| Provider | Holds | Used by |
|---|---|---|
| **GitHub** | The source. Pushes trigger Vercel builds. | all environments |
| **Vercel** | Hosting, environments, domains, the cron scheduler. | preview, staging, production |
| **Neon** | PostgreSQL. One branch per environment. | all |
| **Auth0** | The identity provider behind every `OAUTH_*` variable. | all |
| **Stripe** | Subscriptions, Checkout, the Billing Portal, the webhook. | staging (sandbox), production (live) |
| **Porkbun** | Registrar for `retrograde.sh` and its DNS. | production, staging |

Six providers, one concern each. The cost of the stack is not the number of
dashboards; it is that the same handful of secrets exists in four places with
different values. That table is below, and it is the thing to keep current.

---

## Environments

| | Local | Preview | Staging | Production |
|---|---|---|---|---|
| **Trigger** | `npm run dev` | any pushed branch / PR | pushes to `staging` | pushes to `main` |
| **Vercel environment** | — | Preview | `staging` (custom) | Production |
| **`VERCEL_TARGET_ENV`** | unset | `preview` | `staging` | `production` |
| **URL** | `http://localhost:3000` | generated per deployment | `https://staging.retrograde.sh` | `https://retrograde.sh` |
| **Database** | local Postgres | Neon `preview` branch | Neon `staging` branch | Neon primary |
| **Auth0** | its own app | not configured | its own app | its own app |
| **Stripe** | sandbox + `stripe listen` | not configured | sandbox | live |
| **Scheduled cleanup** | never | never | never | daily, 03:00 UTC |
| **Deployment protection** | — | on (Vercel default) | **off** | off |

**Preview deployments are throwaway.** Each gets a hostname nobody can register
in advance, so Auth0 and Stripe are not wired to them: the app builds its OAuth
callback from `VERCEL_URL` there, and no Stripe webhook points at them. Use a
preview to look at a branch, not to test sign-in or payment.

**Staging is the end-to-end environment.** One stable domain, real Auth0, real
Stripe (in a sandbox), its own database. It is where the whole loop —
sign in, subscribe, webhook, entitlement — is exercised before production.

---

## Setting up staging

1. **Branch.** Create a long-lived `staging` branch on GitHub.
2. **Vercel environment.** Project → Settings → Environments → add a custom
   environment named `staging`, tracking the `staging` branch.
3. **Domain.** Add `staging.retrograde.sh` and assign it to that environment.
   DNS lives at Porkbun; pointing the nameservers at Vercel keeps domains and
   DNS in one place.
4. **Deployment protection: off for this environment.** Vercel protects
   non-production deployments with its own login wall, which answers Stripe's
   webhook and Auth0's callback with a login page instead of the app. Turning
   protection off is what makes an end-to-end test real. Staging then is
   publicly reachable, which is why it uses a sandbox and its own database.
5. **Database.** Create a Neon branch for staging and use its connection string
   as `DATABASE_URL`. The schema builds itself on first boot.
6. **Auth0.** A separate application, with
   `https://staging.retrograde.sh/auth/callback` as an allowed callback URL and
   the same logout URL policy as production.
7. **Stripe.** In the **sandbox**, create the product and its monthly price, a
   restricted key, and a webhook endpoint at
   `https://staging.retrograde.sh/api/stripe/webhook` subscribed to the six
   events listed below. Sandbox ids are not live ids.
8. **Environment variables.** Scope every variable below to the `staging`
   environment. `OAUTH_REDIRECT_URI` must be set explicitly here — see the
   first gotcha.

---

## Where each variable's value comes from

| Variable | Source |
|---|---|
| `DATABASE_URL` | Neon → the branch's connection string (keep `sslmode=require`) |
| `SESSION_SECRET` | generated: `openssl rand -base64 48` — different per environment |
| `SITE_ADMIN_IDS` | Auth0 → the user's `sub` claim, stored as `users.external_id`. Not an email |
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | Auth0 → the application |
| `OAUTH_AUTHORIZATION_URL`, `OAUTH_TOKEN_URL`, `OAUTH_USERINFO_URL` | Auth0 → `https://<tenant>/authorize`, `/oauth/token`, `/userinfo` |
| `OAUTH_REDIRECT_URI` | this environment's own domain + `/auth/callback`, registered in Auth0 |
| `OAUTH_SCOPES` | `openid profile email` |
| `OAUTH_USERNAME_FIELD` | optional; the profile field shown as the username, default `preferred_username` |
| `STRIPE_RESTRICTED_KEY` | Stripe → restricted key, from the matching mode |
| `STRIPE_PRICE_ID` | Stripe → the product's **price** (`price_…`), not the product (`prod_…`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → the endpoint's signing secret, or `stripe listen` locally |
| `CRON_SECRET` | generated; Vercel's cron sends it automatically |
| `SELF_HOSTED`, `HIDE_LOGOUT`, `SITE_LOGO_*` | never set on Vercel — these are for self-hosted instances |

---

## Endpoints the outside world calls

| Endpoint | Caller | Auth |
|---|---|---|
| `POST /api/stripe/webhook` | Stripe | signature, verified against `STRIPE_WEBHOOK_SECRET` |
| `GET /api/v1/cron/archive-stale` | Vercel cron (`vercel.json`, 03:00 UTC) | `Authorization: Bearer $CRON_SECRET` |
| `/auth/callback` | the browser, after Auth0 | OAuth `state`, checked against the session |
| `/api/v1/*` | AI agents | API key, or none on the tier-1 trial path |

The Stripe webhook subscribes to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`.
It is the only writer of `users.subscription_status`, which is the paid tier
(ADR-0013). **Without a live-mode endpoint, a customer can pay and get
nothing.**

---

## Things that bite

1. **A named environment reports `VERCEL_ENV=preview`.** Staging would have
   built its OAuth callback from the deployment's throwaway hostname. The app
   reads `VERCEL_TARGET_ENV` instead, so only an unnamed preview generates its
   callback and every named environment uses `OAUTH_REDIRECT_URI` (ADR-0023).
   Setting `OAUTH_REDIRECT_URI` for the Preview environment does nothing.
2. **Deployment protection answers webhooks with a login page.** Off for
   staging. Leave it on for previews, which nothing calls back into.
3. **Stripe ids are per-mode.** A sandbox `price_…` does not exist in live. The
   failure shows up at Checkout, not at startup.
4. **Sandbox, not Test Mode.** Test Mode shares settings with the live account;
   a sandbox is isolated. Accepting Managed Payments terms and setting the
   product tax code in a sandbox does **not** carry over to live.
5. **Startup exits on bad configuration, in every environment** (ADR-0018). On
   Vercel that means every request 500s, so check variables before deploying.
   `SITE_ADMIN_IDS` is the one most likely to be missing.
6. **`DATABASE_URL` and the `PG_*` variables are exclusive.** Setting both
   refuses to boot.
7. **Never set `SELF_HOSTED` on Vercel.** With Stripe configured it refuses to
   boot; without, it would hand every account the paid tier free (ADR-0016).
8. **The cron runs on production only.** Staging archives nothing, which is
   also true of self-hosted instances (ADR-0020).
9. **Auth0 must actually return the username claim.** `OAUTH_USERNAME_FIELD`
   selects one of `preferred_username`, `email`, `name`, `given_name`,
   `family_name`; a connection that omits the default shows people as "Guest"
   until it is set to a claim Auth0 sends.
