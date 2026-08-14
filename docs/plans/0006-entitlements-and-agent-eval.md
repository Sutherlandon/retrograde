# Plan: Membership entitlements + pre-launch correctness evidence

**Date:** 2026-08-11 · **Branch:** `agent-substrate` · **Status:** ⚠️ **DRAFT — NOT REVIEWED. Landon flagged the originating plan as "gets a lot wrong" on 2026-08-11; refinement discussion pending.** Do not act on this document until that discussion happens.

**Companion:** `0005-action-registry-audit.md` — the inventory this plan gates. Read it first; the same **[read]** / **[reported]** verification tags apply, and this plan's premises depend on findings that document flags as unconfirmed.

## Context

Crews are about to be sold. The requirement driving this plan, stated directly:

> "I'm about to do a big release and ask people to pay for something. I know crews have value, but I need to be confident the work is complete and correct beyond you claiming it to be so."

So the deliverable is not a gate alone — it is a gate plus a mechanism that *demonstrates* the gate holds, independently of anyone's assertion. That reframes "evaluation layer to validate agent code" away from a rubric for grading agent-written code and toward **executable, table-driven proof of the permission surface**.

Two constraints shape everything below:

- **Anonymous boards stay open.** No access control, by design — an anonymous owner returning later cannot be re-identified. Any gate must preserve today's anonymous behavior exactly.
- **Nothing is paid-gated today** **[reported]**. There is no plan, subscription, or entitlement concept in code; `docs/adr/0003-teams-as-billing-unit.md` reserves the place for one, and `docs/plans/0002-teams-api-keys-ephemerality.md` explicitly defers billing.

---

## Part A — Entitlement model

**Recommendation: entitlements resolve from the team, not the user.** A user's capability on a board is the capability of that board's team. This follows ADR-0003 (teams as the billing unit) and matches the fact that `teams` already exists with a comment reserving it for billing.

- Add `teams.plan TEXT NOT NULL DEFAULT 'free'` to `app/server/db_init.ts` as idempotent DDL — no migration files, per CLAUDE.md.
- One resolver module, `app/server/entitlements.ts`, exporting `getEntitlements(teamId)` and `requireEntitlement(request, boardId, capability)`. Site it alongside `app/server/board_permissions.ts` and follow that module's throw-a-`Response` convention (401 no session / 403 not permitted) **[read]** so route code stays uniform.
- Key capabilities to registry IDs from the companion plan, so the spec and the enforcement share one vocabulary.
- `app/features.ts` **[read]** is dead code — `FEATURES.production` is empty, the only development flag is commented out, and `feature()` is reportedly never called anywhere. Either delete it or make it the flag that dark-launches the gate. Do not leave two flag mechanisms in the tree.

Explicitly out of scope, consistent with the deferral already recorded in `docs/plans/0002-teams-api-keys-ephemerality.md`: Stripe, subscription state, seats, quotas.

**Open question for tomorrow:** whether `plan` on `teams` is the right shape at all, or whether the free/paid line should ride on the existing `teams.restrict_board_access` + `is_personal` flags that already differentiate personal from named crews. This draft assumes a new column; that assumption has not been challenged.

## Part B — Prerequisite: close the ungated routes

Per Finding 1 of the companion plan **[read]**, `board.title.ts`, `board.columns.ts`, `board.notes.ts` (except `intent=vote`), and `board.timer.ts` perform no access check. No entitlement layer can sit on top of routes that check nothing.

The fix must preserve open anonymous boards:

> If the board has no team, or its team is not restricted → allow (today's anonymous behavior, unchanged).
> Otherwise → `requireBoardAccess`.

That is precisely what `getBoardAccess` in `app/server/board_permissions.ts` already computes **[read]** — allow when the board is teamless or its crew is unrestricted; otherwise limit to crew members, the board's own owner/facilitators, and agents whose API key belongs to the board's crew. **Reuse it; do not write a new predicate.** Add the call to the four routes above.

Server-side `boardLocked` / `notesLocked` enforcement belongs in the same pass: same shape, same client-only weakness **[reported]**.

Also decide the claim flow (Finding 2). Either fix it — stop setting `created_by` on homepage boards, or relax the claim predicate — or delete it and remove the "log in to claim" hint. A visible affordance that cannot succeed is worse than either.

## Part C — Correctness evidence

Three layers, in dependency order.

**1. Permission matrix tests.** One table-driven suite (`app/server/entitlements.test.ts` plus per-route cases) asserting *every* registry action × *every* actor resolves to an explicit allow or deny. Actor list: anonymous-no-session, anonymous-with-session, registered non-member, board member, facilitator, board owner, crew member, crew owner, API key in-crew, API key out-of-crew, granted admin, site admin. Follow the mocking style already established in `app/server/board_permissions.test.ts`.

The load-bearing property: **a row with no assertion fails the suite.** An unenumerated action becomes a test failure rather than a silent hole. That is what makes the result evidence instead of a claim.

**2. Registry-to-test linkage.** Each test names its registry ID; a check asserts every non-`Broken` registry row has at least one referencing test. This turns the audit's `Unverified` column into a burn-down list that cannot quietly regress.

**3. Agent API contract tests.** Extend the existing `app/routes/api/*.test.ts` files to cover the cross-tier cases they skip. Specifically flagged **[reported, unconfirmed]**: `POST /api/v1/boards/:id/notes` may authorize only "is *some* user" — unlike the action-items endpoint it reportedly calls neither `userCanFacilitate` nor `requireBoardAccess`, which would let any valid bearer token post notes to any board id, including a restricted crew's. Confirm this before treating it as a finding.

## Part D — Release-readiness checklist

The artifact that actually answers "is it correct?" — a table of what must reach **Verified** before crews are sold, each line citing the test that proves it, so the answer is a command that passes or fails rather than an opinion:

- The four ungated routes closed and tested.
- `restrict_board_access` enforced on **write**, not only read.
- The notes API access check confirmed and, if absent, added.
- API-key mint / revoke covered end to end.
- The claim flow fixed or removed.
- Every `CREW-*` registry row at `Verified` — the paid surface specifically, since that is what is being charged for.

---

## Sequencing

Part B is the prerequisite; A and C depend on it. C-1 is what converts the work from "done" to "demonstrably done," so it should not be deferred past the release. Part D is written last but read first by anyone deciding whether to ship.

## Verification

- `npm test` and `npm run typecheck` green throughout.
- The matrix suite must fail when a guard is deliberately removed from a route — check this by temporarily deleting one `requireBoardAccess` call and confirming a red test. A suite that stays green under that mutation is not evidence of anything.
- Manual end-to-end confirmation of the two premises this plan rests on, per the companion plan's verification section.
