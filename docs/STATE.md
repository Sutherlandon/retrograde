# Retrograde — Project State

**Updated:** 2026-09-14 · **Version:** 2.0.0-rc.1 · **Branch:** `release/2.0.0-rc.1` (cut from `agent-substrate`, ahead of `main`, unreviewed)

Where the project is right now. For *what* the product does, action by action, see [`docs/spec/0001-action-registry.md`](spec/0001-action-registry.md). For *why* the load-bearing decisions were made, see [`docs/adr/`](adr/README.md).

---

## Quick Pulse

| | |
|---|---|
| Stack | React 19, React Router 7 (SSR), Tailwind 4, PostgreSQL via raw `pg` |
| Hosting | Vercel (web) + Neon (Postgres) |
| Auth | OAuth 2.0 — Keycloak in Docker for local, external IDP in prod |
| Tests | 3,340 passing across 86 files (Vitest + RTL, jsdom, mocked `pg`) — includes a 2,448-cell permission matrix and a registry-linkage check |
| Real-time | Polling, no WebSockets |
| Schema | Idempotent DDL in `app/server/db_init.ts`, no migration tool — 33 numbered blocks |

## Branch state

`release/2.0.0-rc.1`, cut from `agent-substrate`, carries the whole agent-substrate arc and **has not shipped to production or been reviewed by a human**: the agent JSON API, mandatory agent attribution, teams as the billing unit, API keys, free-tier ephemerality, multi-member crews, the facilitator role, action items, the crew-centric dashboard, members-only crew boards, server-side enforcement of the whole tier model with a permission-matrix proof suite, and a live Stripe paywall with Stripe as merchant of record. ADRs 0001–0021 cover the decisions.

**It is 2.0.0, not 1.7.0, because the boot contract changed.** Every environment variable is validated at startup, so a deployment that upgrades with missing or malformed configuration exits instead of degrading — `SITE_ADMIN_IDS` included — and the database connection requires TLS outside local development (ADR-0018). The hosted service also needs the three Stripe variables and `CRON_SECRET`; a self-hosted install sets `SELF_HOSTED=true` and must not set them (ADR-0016, ADR-0020). Nothing is configured by editing code: `app/config/siteConfig.ts` is gone, so a deployment that used `dashboardHome` to hide logout now sets `HIDE_LOGOUT=true`, and its logo comes from the `SITE_LOGO_*` URLs. The logout redirect is read from `OAUTH_LOGOUT_REDIRECT_URL` (ADR-0017). [`README.md`](../README.md) is the self-hosting guide.

No human has looked at any of it in a browser. That review is the gate before merge:

1. Eyeball in light + dark, desktop + mobile: Mission Objectives panel, Crew Access modal, crew pages, dashboard columns.
2. Run the facilitator grant flow end to end with two real registered accounts.
3. Confirm the Crew Access modal copy is explicit that `open_facilitation` hands locks, column deletion, and facilitator-granting to anonymous participants.
4. Decide whether facilitators managing other facilitators matches intent, or should tighten to owner-only.

## Access model

Three tiers, named for what the account is entitled to: **1 Anonymous** (no account, crewless boards, 30-day TTL), **2 Registered** (free, personal crew, facilitator role, API keys), **3 Paid** (named crews, human members, members-only board access). The boundary in code is `teams.is_personal`.

Board access is a separate axis from the tier: a board is members-only only when its crew has `restrict_board_access = true`, which only a named crew can set. A tier-3 crew with it off is as open as a tier-1 board. The registry's header states the model; its guard column says which mechanism enforces each action.

**Facilitator is the primitive.** Every board control is designed for the facilitator role; the owner is a facilitator who also holds lifecycle rights (delete, archive, duplicate, move) and cannot be demoted. `isOwner` is the right gate only for those lifecycle controls, which live on the dashboard. On a board page, reach for `canFacilitate`.

**Lapse behavior (ADR-0015).** Entitlement covers the whole crew surface, not just creation, and is checked against the **crew owner** rather than the acting user — members are often free accounts. A lapse returns 402, freezes all crew management and new work, and revokes the owner's named-crew API keys via the webhook. It deliberately does **not** relax `restrict_board_access`: a billing lapse must never widen access. Known sharp edge, accepted deliberately: a lapsed owner cannot remove a member or delete their own crew. Revisit first if it generates support load. The crew page (`crews.$id.tsx`) mirrors this in the UI: a lapsed named crew shows a read-only banner with a "Subscribe" CTA and disables every frozen control (rename, roster, AI crew, boards, settings, danger zone, and add/edit/delete on crew action items) — only checking an item off stays interactive, per CREW-015.

**Self-hosted instances (ADR-0016).** `SELF_HOSTED=true` makes every account tier 3: the entitlement seam returns true without reading billing state, so every account can create named crews and lapse never applies. Billing and scheduled cleanup do not exist there — the Stripe variables and `CRON_SECRET` are refused at startup, the three billing routes and the cleanup endpoint return 404, the sidebar hides Billing, and crewless boards are never archived (ADR-0020). The personal crew's one-key cap still applies, as it does to a paying hosted account. The dashboard is also home: every marketing page redirects to it, the sitemap returns 404, and the header drops About and Contact. Vercel Analytics does not load there (ADR-0017). There are no guests either: every page and API call needs a signed-in account or an API key, enforced in the identity helpers rather than per route, with a coverage test over `routes.ts` (ADR-0021).

**The model is enforced.** Facilitator-only controls, locks, board access on both API write routes, ownership on duplicate, and the crewless-board invariant are all checked on the server (commits `21ab531`, `01cd18a`; ADR-0011). The registry's Gaps table is empty. On the hosted service the paid tier is real: `accountCanCreateNamedCrew` reads `users.subscription_status`, which only the signature-verified Stripe webhook writes (ADR-0013).

## Known rough edges

1. **Every environment variable is validated at startup** (ADR-0013, ADR-0016, ADR-0018, CLAUDE.md rule 5). Required ones exit when missing and optional ones exit when malformed; the Stripe variables and `CRON_SECRET` are required on the hosted service and refused when `SELF_HOSTED=true`. `npm run build` does not execute `db_config.ts`, so a CI build catches none of this — only a server boot does. Vercel production needs `SITE_ADMIN_IDS` set before this branch deploys.
2. **Stripe is the merchant of record** (ADR-0014). Managed Payments remits sales tax/VAT/GST in 80+ countries for 3.5% per transaction (~$1.40 on $39.99). Consequences to know: Stripe emails customers directly from Link (receipts, invoices, renewal notices), handles payment support, and may refund unilaterally if it asks you for product input and gets no reply within 48 hours. `automatic_tax` must never be set — Managed Payments forbids it, and a test enforces that.
3. **The permission matrix has no registered-but-unsubscribed actor.** Its fixture answers the entitlement query with `active` for every registered human, so it proves "registered + active → allowed" and "everyone else → denied" for CREW-002; the not-subscribed case is covered by `entitlements.test.ts` and `crews.test.ts`, not the matrix.
4. **Entitlement is `active` only.** A `past_due` renewal (still inside Stripe's retry window) closes the gate immediately. One-line change in `entitlements.ts` if a grace period is wanted.
5. **The one-time reset in `db_init.ts` block 32 has not run against production.** It strips anonymous/agent owner rows from crewless boards and opens facilitation on the ones left with no owner, gated so it runs once. Boards with a registered owner keep their owner and their facilitation setting (ADR-0022). Nothing observable changes for any board, but it is a data mutation — read it before the first production deploy of this branch.
6. **No structured logging** (issue #82). `console.log` only.
7. **Test coverage gaps:** `board.poll.ts` has no direct route test beyond the permission matrix; `Board`, `ClaimModal`, `AttachmentModal`, `ThemeToggle` have no component tests, and `AppLayout` has loader tests but none of its rendering. Every registry row is Verified.
8. **The README covers self-hosting only** (issue #10). Development setup lives in `CLAUDE.md`. The Docker instructions in it have not been run against a Docker build of this branch.
9. **~30 stale local branches** from merged PRs.
10. **Database TLS has been exercised against a local TLS-only Postgres, not against Neon.** Outside development the pool connects with `ssl: { rejectUnauthorized: true }`. Neon's certificates chain to public CAs, so the hosted connection should verify, but the first deploy of this branch is the first time it runs against Neon. `npm start` against a local Postgres without TLS does not connect; develop with `npm run dev`.

## Behavioral notes that are easy to get wrong

- Dashboard `role='team'` is a presentation-only pseudo-role from a `COALESCE` — never write it to `board_members`.
- Any session user can un-check another user's completed action item. Per-item assignees are the refinement (ADR-0006).
- Crew action items have no attribution display.
- Facilitator grants are **not** copied when a board is duplicated.
- Claiming a board assigns it to the claimer's personal crew, which makes it permanent (the 30-day TTL only touches crewless boards), but deliberately leaves `open_facilitation` alone so a claim never takes the Command Deck away from a live retro (ADR-0012). Moving a board never changes it either (ADR-0022).
- "Anonymous" means **no owner row**, not "no crew" (ADR-0022). Every pre-2.0 board is crewless and most have a registered owner; those get full Crew Access. Check `hasOwner`, never `team_id`/`teamName`, when deciding whether a board is anonymous.
- Agent-authored notes always carry attribution, regardless of the board's attribution setting (ADR-0002).
- Personal crews cannot be renamed, deleted, restricted, or given human members — but they can mint exactly one API key; the second is a named-crew (tier 3) action.

## Deferred by design

Recorded so they aren't rediscovered as gaps: annual billing (a second Price on the same Product), MCP server, webhooks, per-key API scopes, account-level (non-crew) API keys, agent-name verification, JSON update/delete of notes, and pagination on board reads. Agent activity metering and the rate limiting that covers the unauthenticated trial path are tracked, not deferred — issue #105.

## Operational reality

- Solo developer with AI-assisted commits.
- Vercel + Neon; preview deploys stand in for staging.
- `initializeDatabase()` runs on every startup — idempotent, but startup always touches the DB.
- A dev seed board (`dev-test`) is created at the bottom of `db_init.ts` and runs in production too. Harmless, noisy.
- The auto-archive cron (API-006) is invoked by Vercel with a **GET**; it previously implemented POST only, so it answered 405 and never ran. Boards created before 2026-10-01 are exempt (ADR-0019), so the first run archives nothing that exists at release; the earliest archive is 2026-10-31.
- Honeypot on free-board creation is the only bot defense. Turnstile was removed deliberately (issue #87) — an agent must be able to create a board without solving a captcha. If bots become a problem, the answer is rate limiting, not a captcha.
