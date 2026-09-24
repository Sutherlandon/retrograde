# ADR-0016: Self-hosted instances are tier 3 for every account

## Status

Accepted (2026-09-14) — narrows [ADR-0013](0013-stripe-subscriptions.md) §5: the Stripe variables are required on the hosted service only. Extends [ADR-0011](0011-three-tiers-and-ownerless-anonymous-boards.md) §1 and [ADR-0015](0015-what-happens-when-a-subscription-lapses.md); neither is contradicted. §5's statements that `CRON_SECRET` stays required and the ADR-0005 TTL applies on a self-hosted instance are amended by [ADR-0020](0020-self-hosted-instances-run-no-scheduled-cleanup.md): a self-hosted instance runs no scheduled cleanup. §5's statement that tier 1 is unchanged is amended by [ADR-0021](0021-self-hosted-instances-have-no-guests.md): a self-hosted instance has no guests.

## Context

Retrograde runs in two ways. The hosted service on Vercel sells the paid tier through Stripe (ADR-0013). A self-hosted instance runs on a customer's own network and is licensed outside Stripe: the customer pays for the software, not per account, so every account on that instance is owed the paid tier.

The code had one answer for both. `accountCanCreateNamedCrew` and `crewIsEntitled` read `users.subscription_status`, which only the Stripe webhook writes, so on a self-hosted instance no account could ever create a named crew. And ADR-0013 §5 made the three Stripe variables required at startup in every environment, so a self-hosted instance could not even boot without Stripe credentials it has no use for.

There was no existing switch to key off. `siteConfig.dashboardHome` makes `/` redirect to the dashboard, but it is a source constant, not an environment variable, and it describes a landing-page and logout preference for SSO deployments — not a licensing arrangement.

## Decision

### 1. One explicit environment variable decides the deployment mode

`SELF_HOSTED`, read once in `app/server/db_config.ts` and exported as `selfHosted`. Unset, empty, or `"false"` is the hosted service. `"true"` is a self-hosted instance. **Any other value refuses to boot.** A typo such as `ture` or `yes` must never silently land an instance in either mode, because one mode charges and the other does not.

### 2. Every account on a self-hosted instance is tier 3, through the existing seam

`accountCanCreateNamedCrew` and `crewIsEntitled` return `true` when `selfHosted` is set, without reading billing state. Every paid-tier gate already routes through those two functions (ADR-0011 §1, ADR-0015 §1), so nothing else changes: CREW-002 allows every registered account to create a named crew, the ADR-0015 lapse freeze can never trigger, the subscribe hero never renders, and the lapsed-crew read-only UI never appears.

"Tier 3" means exactly what a paying hosted account gets — no more. The personal crew keeps its one-key cap (ADR-0011 §6, CREW-019): a paying hosted account has that cap too, and gets more agents through named crews.

### 3. Billing does not exist on a self-hosted instance

- The Stripe variables are **not required**, and the Stripe client is `null`.
- `/app/billing/checkout`, `/app/billing/portal` and `/api/stripe/webhook` answer **404** before authenticating anyone, reading a body, or touching Stripe.
- The sidebar's Billing link is hidden for everyone, even though everyone is entitled.
- The dashboard is home and the marketing site does not render ([ADR-0017](0017-deployment-configured-by-environment.md)).

### 4. Stripe configuration on a self-hosted instance is a fatal error

If `SELF_HOSTED=true` and any Stripe variable is set, the process refuses to boot and names the variables. The contradiction has one likely cause: `SELF_HOSTED` set on the hosted deployment by mistake, which would give every account the paid tier for free. The hosted deployment always carries Stripe variables, so that mistake cannot boot.

The opposite mistake — a self-hosted instance upgraded without `SELF_HOSTED` — already fails at startup on the missing Stripe variables. That error names `SELF_HOSTED=true`, so the operator is pointed at the switch rather than at acquiring Stripe keys.

### 5. What the switch does not change

- `CRON_SECRET` and `OAUTH_REDIRECT_URI` are still required through `requireEnv()`.
- Tier 1 is unchanged. Anonymous boards stay crewless and ownerless, and the ADR-0005 TTL applies when the archive cron runs.
- Logout visibility. That is `HIDE_LOGOUT` ([ADR-0017](0017-deployment-configured-by-environment.md)), because it depends on the identity provider, not on how the instance is licensed.

## Consequences

**Positive**
- A self-hosted instance boots with no Stripe account and gives every account the full product, with no fabricated billing rows.
- The change is confined to the entitlement seam, the Stripe config, and three route guards. No gate elsewhere had to learn about deployment modes.
- Both directions of misconfiguration fail loudly at startup. Neither degrades into a wrong but running instance.

**Negative / load-bearing**
- **Required config now depends on a mode.** CLAUDE.md rule 5 still holds — every variable a mode needs is validated at startup — but "required" is no longer one list. The Stripe variables are required in one mode and forbidden in the other.
- **Local development of self-hosted mode needs the Stripe variables removed**, not just `SELF_HOSTED=true` added. That friction is the §4 guard working.
- Nothing distinguishes one self-hosted customer from another. Licence terms such as seat caps, expiry or instance count are not enforced in code. Adding any of them is a new decision.

## Alternatives Considered

1. **Key off `siteConfig.dashboardHome`.** Rejected. It is a build-time constant, so it cannot differ per deployment without a code change. It also means "SSO users land on the dashboard", not "this instance is licensed". A hosted SSO customer who wanted that landing page would be handed tier 3 for free.
2. **Seed `subscription_status = 'active'` for every self-hosted account.** Rejected. It fabricates billing state, and it has to be re-run for every account created later with no webhook to maintain it. It also makes a Stripe status column mean something Stripe never said.
3. **Require an explicit `DEPLOYMENT_MODE` on every deployment, with no default.** Not adopted. It would make the hosted deployment declare a mode it has always implicitly been. The §4 conflict guard already catches the dangerous direction, and the missing-Stripe error catches the other.
4. **Leave the Stripe variables required everywhere and have self-hosted customers set placeholder values.** Rejected. It puts fake credentials into a customer's environment and leaves the billing routes live against them.

## References

- ADR-0011 §1 (the entitlement seam), §6 (one free API key); ADR-0013 §5 (Stripe required at startup); ADR-0015 (lapse); ADR-0005 (free-tier TTL); ADR-0017 (deployment configured by environment).
- `app/server/db_config.ts` (`selfHosted`, the conflict guard, `requireStripeEnv`), `app/server/entitlements.ts`, `app/server/stripe_client.ts`, `app/routes/app/billing.checkout.ts`, `app/routes/app/billing.portal.ts`, `app/routes/api/stripe.webhook.ts`, `app/components/AppLayout.tsx`.
- `docs/spec/0001-action-registry.md` — CREW-002, CREW-020, CREW-021, API-007.
