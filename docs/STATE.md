# Retrograde — Project State

**Updated:** 2026-09-03 · **Version:** 1.6.1 · **Branch:** `agent-substrate` (ahead of `main`, unreviewed)

Where the project is right now. For *what* the product does, action by action, see [`docs/spec/0001-action-registry.md`](spec/0001-action-registry.md). For *why* the load-bearing decisions were made, see [`docs/adr/`](adr/README.md).

---

## Quick Pulse

| | |
|---|---|
| Stack | React 19, React Router 7 (SSR), Tailwind 4, PostgreSQL via raw `pg` |
| Hosting | Vercel (web) + Neon (Postgres) |
| Auth | OAuth 2.0 — Keycloak in Docker for local, external IDP in prod |
| Tests | 3,091 passing across 69 files (Vitest + RTL, jsdom, mocked `pg`) — includes a 2,448-cell permission matrix and a registry-linkage check |
| Real-time | Polling, no WebSockets |
| Schema | Idempotent DDL in `app/server/db_init.ts`, no migration tool — 32 numbered blocks |

## Branch state

`agent-substrate` carries the whole agent-substrate arc and **has not shipped to production or been reviewed by a human**: the agent JSON API, mandatory agent attribution, teams as the billing unit, API keys, free-tier ephemerality, multi-member crews, the facilitator role, action items, the crew-centric dashboard, members-only crew boards, and — as of 2026-09-03 — server-side enforcement of the whole tier model with a permission-matrix proof suite. ADRs 0001–0011 cover the decisions.

No human has looked at any of it in a browser. That review is the gate before merge:

1. Eyeball in light + dark, desktop + mobile: Mission Objectives panel, Crew Access modal, crew pages, dashboard columns.
2. Run the facilitator grant flow end to end with two real registered accounts.
3. Confirm the Crew Access modal copy is explicit that `open_facilitation` hands locks, column deletion, and facilitator-granting to anonymous participants.
4. Decide whether facilitators managing other facilitators matches intent, or should tighten to owner-only.

## Access model

Three tiers, named for what the account is entitled to: **1 Anonymous** (no account, crewless boards, 30-day TTL), **2 Registered** (free, personal crew, facilitator role, API keys), **3 Paid** (named crews, human members, members-only board access). The boundary in code is `teams.is_personal`.

Board access is a separate axis from the tier: a board is members-only only when its crew has `restrict_board_access = true`, which only a named crew can set. A tier-3 crew with it off is as open as a tier-1 board. The registry's header states the model; its guard column says which mechanism enforces each action.

**Facilitator is the primitive.** Every board control is designed for the facilitator role; the owner is a facilitator who also holds lifecycle rights (delete, archive, duplicate, move) and cannot be demoted. `isOwner` is the right gate only for those lifecycle controls, which live on the dashboard. On a board page, reach for `canFacilitate`.

**The model is enforced.** Facilitator-only controls, locks, board access on both API write routes, ownership on duplicate, and the crewless-board invariant are all checked on the server (commits `21ab531`, `01cd18a`; ADR-0011). The registry's Gaps table has one open entry, GAP-005 — the paywall itself, which cannot close until a billing provider exists. The seam it will use (`app/server/entitlements.ts`) already does.

## Known rough edges

1. **Nothing is payment-gated** (GAP-005). Creating a named crew — CREW-002, the tier-3 line — passes through `accountCanCreateNamedCrew`, which returns true for everyone until a billing provider exists. Everything paid follows from it: members, members-only access, crew action items. No plan or subscription concept exists in the schema (issue #59).
2. **The one-time reset in `db_init.ts` block 32 has not run against production.** It strips anonymous/agent owner rows from crewless boards and opens their facilitation, gated so it runs once. Nothing observable changes for those boards, but it is a data mutation — read it before the first production deploy of this branch.
3. **No structured logging** (issue #82). `console.log` only.
4. **Test coverage gaps:** `board.poll.ts` has no direct route test beyond the permission matrix; `Board`, `ClaimModal`, `AttachmentModal`, `AppLayout`, `ThemeToggle` have no component tests. Every registry row is Verified except CREW-002 (Ungated — its seam is tested; nothing charges).
5. **README is 11 lines** (issue #10).
6. **~30 stale local branches** from merged PRs.

## Behavioral notes that are easy to get wrong

- Dashboard `role='team'` is a presentation-only pseudo-role from a `COALESCE` — never write it to `board_members`.
- Any session user can un-check another user's completed action item. Per-item assignees are the refinement (ADR-0006).
- Crew action items have no attribution display.
- Facilitator grants are **not** copied when a board is duplicated.
- Agent-authored notes always carry attribution, regardless of the board's attribution setting (ADR-0002).
- Personal crews cannot be renamed, deleted, restricted, or given human members — but they can mint exactly one API key; the second is a named-crew (tier 3) action.

## Deferred by design

Recorded so they aren't rediscovered as gaps: billing/Stripe (#59), MCP server, webhooks, per-key API scopes, account-level (non-crew) API keys, agent-name verification, JSON update/delete of notes, and pagination on board reads. Agent activity metering and the rate limiting that covers the unauthenticated trial path are tracked, not deferred — issue #105.

## Operational reality

- Solo developer with AI-assisted commits.
- Vercel + Neon; preview deploys stand in for staging.
- `initializeDatabase()` runs on every startup — idempotent, but startup always touches the DB.
- A dev seed board (`dev-test`) is created at the bottom of `db_init.ts` and runs in production too. Harmless, noisy.
- Honeypot on free-board creation is the only bot defense. Turnstile was removed deliberately (issue #87) — an agent must be able to create a board without solving a captcha. If bots become a problem, the answer is rate limiting, not a captcha.
