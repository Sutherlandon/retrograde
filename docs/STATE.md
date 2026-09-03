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
| Tests | 463 passing across 51 files (Vitest + RTL, jsdom, mocked `pg`) |
| Real-time | Polling, no WebSockets |
| Schema | Idempotent DDL in `app/server/db_init.ts`, no migration tool — 31 numbered blocks |

## Branch state

`agent-substrate` carries the whole agent-substrate arc and **has not shipped to production or been reviewed by a human**: the agent JSON API, mandatory agent attribution, teams as the billing unit, API keys, free-tier ephemerality, multi-member crews, the facilitator role, action items, the crew-centric dashboard, and members-only crew boards. ADRs 0001–0010 cover the decisions.

No human has looked at any of it in a browser. That review is the gate before merge:

1. Eyeball in light + dark, desktop + mobile: Mission Objectives panel, Crew Access modal, crew pages, dashboard columns.
2. Run the facilitator grant flow end to end with two real registered accounts.
3. Confirm the Crew Access modal copy is explicit that `open_facilitation` hands locks, column deletion, and facilitator-granting to anonymous participants.
4. Decide whether facilitators managing other facilitators matches intent, or should tighten to owner-only.

## Access model

Three tiers, named for what the account is entitled to: **1 Anonymous** (no account, crewless boards, 30-day TTL), **2 Registered** (free, personal crew, facilitator role, API keys), **3 Paid** (named crews, human members, members-only board access). The boundary in code is `teams.is_personal`.

Board access is a separate axis from the tier: a board is members-only only when its crew has `restrict_board_access = true`, which only a named crew can set. A tier-3 crew with it off is as open as a tier-1 board. The registry's header states the model; its guard column says which mechanism enforces each action.

**Facilitator is the primitive.** Every board control is designed for the facilitator role; the owner is a facilitator who also holds lifecycle rights (delete, archive, duplicate, move) and cannot be demoted. `isOwner` is the right gate only for those lifecycle controls, which live on the dashboard. On a board page, reach for `canFacilitate`.

**The model is not fully enforced yet.** The registry's Gaps table lists eight confirmed divergences. Two break the model itself:

- **GAP-001** — facilitator-only controls (board title, columns, prompts, timer) are enforced in the UI but not on the server. Any participant can drive them by posting to the route.
- **GAP-004** — `POST /api/v1/boards/:id/notes` authorizes "is some user," not "may act on this board." Any valid key or session can write notes into any board, including a members-only crew's.

Closing those two is the prerequisite for selling crews. GAP-009 is the coherence bug: two board controls still gate on `isOwner`, so a granted facilitator can lock the board but not delete a column.

## Known rough edges

1. **Nothing is payment-gated** (GAP-005). Creating a named crew — CREW-002, the tier-3 line — needs only a registered session. Everything paid follows from it: members, members-only access, crew action items. No plan or subscription concept exists in the schema (issue #59).
2. **Nothing is claimable** (GAP-002). Anonymous boards are stamped with an owner — the visitor on the homepage path, the *agent itself* on the API trial path — and `board.claim.ts` refuses anything owned. Decided fix: anonymous boards get no owner and `open_facilitation = TRUE` (the two must ship together, or tier 1 loses the Command Deck entirely), plus a claim button on the board (BRD-020). This is the acquisition loop, not a nice-to-have.
3. **Locks are client-only** (GAP-003). `notesLocked` / `boardLocked` are UI conventions with no server counterpart.
4. **`npm run typecheck` reports 30 pre-existing errors** — RR7's `ActionFunctionArgs` now requires `unstable_pattern`, which older test fixtures don't pass. Tests run green via Vitest; new tests sidestep it with `as never`. Fixing the fixtures is an open chore.
5. **Dead components:** `BoardSettingsModal.tsx`, `TimerButton.tsx`, `ExportButton.tsx` are unreferenced. Delete them.
6. **No structured logging** (issue #82). `console.log` only.
7. **`CRON_SECRET` is read via `process.env` directly** in `api/cron.archive-stale.ts`, against the centralized-config rule in CLAUDE.md.
8. **Test coverage gaps:** `board.tsx`, `board.poll.ts`, `board.attachments.ts`, `board.claim.ts` have no route tests; `Board`, `Column`, `BoardContext`, `ClaimModal`, `useTheme` have no component tests. See the registry's "Untested paths."
9. **README is 11 lines** (issue #10).
10. **~30 stale local branches** from merged PRs.

## Behavioral notes that are easy to get wrong

- Dashboard `role='team'` is a presentation-only pseudo-role from a `COALESCE` — never write it to `board_members`.
- Any session user can un-check another user's completed action item. Per-item assignees are the refinement (ADR-0006).
- Crew action items have no attribution display.
- Facilitator grants are **not** copied when a board is duplicated.
- Agent-authored notes always carry attribution, regardless of the board's attribution setting (ADR-0002).
- Personal crews cannot be renamed, deleted, restricted, or given human members — but they can mint API keys.

## Deferred by design

Recorded so they aren't rediscovered as gaps: billing/Stripe, MCP server, webhooks, per-key API scopes, account-level (non-crew) API keys, agent-name verification, rate limiting, JSON update/delete of notes, pagination on board reads, and the trial-board claim flow that converts a teamless board to a crew board.

## Operational reality

- Solo developer with AI-assisted commits.
- Vercel + Neon; preview deploys stand in for staging.
- `initializeDatabase()` runs on every startup — idempotent, but startup always touches the DB.
- A dev seed board (`dev-test`) is created at the bottom of `db_init.ts` and runs in production too. Harmless, noisy.
- Honeypot on free-board creation is the only bot defense. Turnstile was removed deliberately (issue #87) — an agent must be able to create a board without solving a captcha. If bots become a problem, the answer is rate limiting, not a captcha.
