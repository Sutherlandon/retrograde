# ADR-0013: Stripe subscriptions behind the entitlement seam

## Status

Accepted (2026-09-06) — the deferred tax decision is made in [ADR-0014](0014-stripe-is-merchant-of-record.md): Stripe is the merchant of record via Managed Payments, so `automatic_tax` is not used and must not be added. Everything else here stands.

## Context

ADR-0011 put the whole paid tier behind one function, `accountCanCreateNamedCrew(userId)` in `app/server/entitlements.ts`, and left its body as `return true` until a billing provider existed (GAP-005). Stripe is that provider. The decisions here are the ones ADR-0011 explicitly deferred to "when billing lands" — what the subscription is, where its state lives, how the app learns about it, and how the keys are handled. They follow Stripe's current integration guidance (API version `2026-07-29.dahlia`) rather than memory of older patterns.

## Decision

### 1. One Product, one monthly Price, no trial

The paid tier is binary (ADR-0011), so there is one Stripe Product and one recurring monthly Price, referenced by `STRIPE_PRICE_ID`. Checkout charges immediately; there is no trial period — the free path (personal crews, anonymous boards) already does what a trial does. Annual billing, when wanted, is a second Price on the *same* Product, not a second Product: Stripe's own catalog rule is one Product per plan tier, with Prices only for billing variants of the same plan.

### 2. Subscription state lives on `users`, mirroring Stripe's vocabulary

Three columns on `users` — `stripe_customer_id`, `stripe_subscription_id`, `subscription_status` (`db_init.ts` block 33). The subscription belongs to the account, not to any crew (ADR-0011: no `teams.plan`). `subscription_status` stores Stripe's own status strings verbatim (`active`, `past_due`, `canceled`, …); the app never translates them, so there is no second state machine to keep in step with Stripe's. The gate is exactly `subscription_status = 'active'`.

### 3. Stripe-hosted surfaces only — no Stripe.js in the browser

Checkout is a server-created Checkout Session in `mode: "subscription"` that the app redirects to (`app/routes/app/billing.checkout.ts`). Self-service management — cancel, change payment method, and any future upgrade/downgrade — is the Stripe Billing Portal (`billing.portal.ts`), not hand-built UI. Because nothing loads Stripe.js client-side, there is no publishable key in the app and no CSP change.

The Checkout Session never sets `payment_method_types`. Stripe chooses eligible methods from Dashboard configuration; hardcoding the list is the mistake Stripe's guidance flags first.

### 4. The webhook is the source of truth, and it handles the full lifecycle

`app/routes/api/stripe.webhook.ts` is the only place Stripe writes to the app. It verifies every event's signature against `STRIPE_WEBHOOK_SECRET` from the raw request body before doing anything else, and handles `checkout.session.completed`, `checkout.session.async_payment_succeeded` (gated on `payment_status = 'paid'`), `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Fulfillment never happens on the checkout success page: that page only shows a confirmation, and the gate opens when the webhook writes `active`. The two invoice events are not optional — without them a failed renewal is invisible until the subscription finally cancels.

A verified event always gets a 200, handled or not, so Stripe never retries something the app chose to ignore.

### 5. Keys: restricted, least-privilege, and required at startup

The app uses a **restricted API key** (`rk_…`), never the account's secret key, scoped to Checkout Sessions (write), Customers (write), Billing Portal Sessions (write), Subscriptions (read). The webhook signing secret is handled with the same care as the key. Both, and `STRIPE_PRICE_ID`, are read once in `app/server/db_config.ts` through `requireEnv()`, which exits the process with a clear message if any is missing — in every environment, with no `NODE_ENV` carve-out. That is CLAUDE.md rule 5 applied literally.

The same pass retrofitted two existing violations of that rule: `CRON_SECRET` had been checked lazily per request (a 500 instead of a refused boot), and `OAUTH_REDIRECT_URI` was read through a TypeScript `!` assertion that has no runtime effect. Both now go through `requireEnv`. `SITE_ADMIN_IDS` is deliberately still a warning, because empty is a supported state, not a misconfiguration.

## Consequences

**Positive**
- GAP-005 closes with one function body change; nothing outside `entitlements.ts`, the two billing routes, and the webhook knows Stripe exists.
- No card data, no payment UI, and no client-side Stripe code in the repo. The attack surface is one signature-verified endpoint.
- Subscription state is legible in the database in Stripe's own terms, so support questions can be answered with a `SELECT`.

**Negative / load-bearing**
- **The app will not boot without Stripe configuration**, including in local development. Every environment needs `STRIPE_RESTRICTED_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID` set to real test-mode values. This is intended, and it is the price of rule 5 having no exceptions.
- Local webhook delivery needs the Stripe CLI (`stripe listen --forward-to …/api/stripe/webhook`); without it a local checkout completes on Stripe's side but the gate never opens locally.
- Entitlement is `active` only. `past_due` — a renewal that failed but is still in Stripe's retry window — closes the gate immediately. That is the strict reading; loosening it (grace period) is a one-line change here if it proves too abrupt.
- **Stripe Tax is not enabled.** Charging US or EU customers carries sales-tax/VAT obligations, and `automatic_tax` collects nothing until a Stripe Tax registration exists — silently, with no error. This must be decided before charging real customers; it is a jurisdiction decision, not a code one.

## Alternatives Considered

1. **Use the account secret key.** Rejected: a compromised restricted key can do only what it was scoped to; a compromised secret key can do anything. Stripe's guidance is to default to restricted keys.
2. **A `plan` column on `teams`.** Rejected in ADR-0011 and still rejected: the subscription is the account's.
3. **Custom payment form via Payment Element.** Rejected: it puts Stripe.js, a publishable key, and CSP directives into the app for no benefit at one price and one plan. Hosted Checkout is the recommended surface for exactly this shape.
4. **Fulfil on the checkout success page.** Rejected: the success redirect can arrive before payment settles (asynchronous methods) or never arrive at all; only the webhook is authoritative.
5. **Keep Stripe config optional so `npm run dev` boots without it.** Rejected by the user in favor of rule 5 without carve-outs; a `NODE_ENV` branch would be one more thing to keep honest.

## References

- ADR-0011 (tiers, the entitlement seam, no `teams.plan`), ADR-0003 (teams as billing unit).
- `app/server/entitlements.ts`, `app/server/billing_model.ts`, `app/server/stripe_client.ts`, `app/server/db_config.ts` (`requireEnv`), `app/server/db_init.ts` (block 33), `app/routes/app/billing.checkout.ts`, `app/routes/app/billing.portal.ts`, `app/routes/api/stripe.webhook.ts`.
- `docs/spec/0001-action-registry.md` — CREW-002, GAP-005.
- GitHub issue #59.
