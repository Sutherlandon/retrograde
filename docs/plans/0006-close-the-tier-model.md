# Plan: Close the tier model before selling crews

**Status:** Accepted 2026-09-03 · **Branch:** `agent-substrate`

Crews are about to be sold. The requirement:

> "I'm about to do a big release and ask people to pay for something. I know crews have value, but I need to be confident the work is complete and correct beyond you claiming it to be so."

So the deliverable is not a paywall. It is the enforcement the three-tier model already promises, plus a test suite that proves it holds — a command that passes or fails, not an assertion. The gaps are enumerated and verified in [`docs/spec/0001-action-registry.md`](../spec/0001-action-registry.md); this plan closes them.

## The entitlement question, answered

The tiers are **1 Anonymous**, **2 Registered**, **3 Paid**, and the boundary between 2 and 3 is a single action: creating a named crew (CREW-002). Everything paid hangs off it — human members, members-only board access, crew action items — because all of them require a crew that isn't personal. `teams.is_personal` already draws that line and the crew route already enforces it on four of the five actions.

**So the payment gate is one check in one place:** CREW-002 in `crews.tsx`. Nothing else needs a new gate; the existing `!is_personal` guards inherit it.

**Do not add a `plan` column to `teams`.** A crew is paid or not by virtue of existing as a named crew — the subscription belongs to the *account*, not to each crew it owns. When Stripe lands, the account's subscription state answers "may this user create another named crew?" and nothing downstream changes. Putting `plan` on `teams` would make every crew claim its own tier and would drift from `is_personal` the first time the two disagree.

Do not conflate the paid line with `restrict_board_access` either. That switch is a tier-3 *feature*, not the tier itself: a named crew with it off has boards as open as an anonymous one. Access enforcement and entitlement are separate axes and the permission predicate should keep knowing only about access.

`app/features.ts` is dead — `FEATURES.production` is empty and `feature()` is never called. Delete it or make it the flag that dark-launches this work. Do not leave two flag mechanisms in the tree.

## Part A — Close the two model-breaking gaps

**GAP-001 — facilitator controls are UI-only.** Six actions accept requests from any participant with board access: BRD-003 (board title), BRD-012 (column prompts), BRD-013 (delete column), DECK-002/003 (timer start/stop), DECK-006 (add column). Add `requireFacilitator` to `board.title.ts`, `board.timer.ts`, and the POST/DELETE/`updatePrompt` branches of `board.columns.ts`.

Note what stays open: adding, editing, deleting, moving and reordering **notes** (BRD-004–008) and editing a **column title** (BRD-011) are participant actions at every tier. Only run-the-retro controls move to the facilitator. At tier 1 this changes nothing, because `open_facilitation` and the absent owner make `canFacilitate` true for everyone.

**GAP-004 — the notes API authorizes the wrong thing.** `api/board.notes.ts` calls `getApiUser` and never checks the board. Add `getBoardAccess` and return 403 on a board the caller's key has no relationship to, matching `api/board.ts`.

**GAP-009 — two controls gate on ownership instead of facilitation.** `Column.tsx` gates the column menu (prompts, delete column) on `isOwner`, and `AttachmentsList.tsx` gates attachment deletion the same way. Switch both to `canFacilitate`. The server already agrees for DECK-019; only the UI refuses.

Facilitator is the primitive. `isOwner` is the correct gate only for board lifecycle — delete, archive, duplicate, move — which lives on the dashboard, not the board. Any new board control defaults to `canFacilitate`; reaching for `isOwner` on a board page is the smell.

## Part B — Close the rest

- **GAP-006** — `duplicateBoardServer` takes a `userId` and never checks it. Require board access before copying.
- **GAP-007** — guard the `board.attachments.ts` loader with `requireBoardAccess`.
- **GAP-008** — add `getBoardAccess` alongside `userCanFacilitate` in `api/board.action-items.ts`.
- **GAP-003** — enforce `notesLocked` / `boardLocked` server-side in `board.notes.ts` and `board.columns.ts`. Locks are currently a UI convention; a direct request writes through them.
- **GAP-002** — **decided: anonymous boards have no owner.** Drop the `setBoardOwner` calls at `home.tsx:80` and `api/boards.ts:89` (keep the one at `:75` — an authenticated caller's board is genuinely owned). This must ship together with setting `open_facilitation = TRUE` on crewless boards, because `canFacilitate` is `open_facilitation OR role IN ('owner','facilitator')` and the creator's owner row is currently the only thing granting the Command Deck on an anonymous board. Dropping the owner alone would leave tier 1 with no facilitation at all. Then add **BRD-020**: a claim button on the board, shown when the board has no owner. That is the primary affordance; the dashboard's paste-a-link modal (DASH-016) is the fallback.

## Part C — Proof

**1. Permission matrix.** One table-driven suite asserting every registry action × every actor resolves to an explicit allow or deny. Actors: anonymous no-session, anonymous with session, registered non-member, board member, facilitator, board owner, crew member, crew owner, in-crew API key, out-of-crew API key, granted admin, site admin. Follow the mocking style in `app/server/board_permissions.test.ts`.

The load-bearing property: **a row with no assertion fails the suite.** An unenumerated action becomes a test failure rather than a silent hole. That is what makes it evidence.

**2. Registry linkage.** Each test names its registry ID. A check asserts every non-`Broken` row has at least one referencing test, which turns the registry's `Unverified` column into a burn-down list that cannot quietly regress.

**3. Mutation check.** The suite must go red when a guard is deleted. Verify by temporarily removing one `requireBoardAccess` call and confirming a failure. A suite that stays green under that mutation proves nothing.

## Release gate

Crews are sellable when every one of these is true and cited by a passing test:

- GAP-001 and GAP-004 closed.
- `restrict_board_access` enforced on write as well as read, across the browser routes and the JSON API.
- GAP-002 fixed: anonymous boards ownerless and openly facilitated, BRD-020 shipped, and a test proving an agent's `agent_token` still writes to a board after a human claims it. That continuity is the conversion path; breaking it silently would cost more than the paywall earns.
- API key mint and revoke covered end to end.
- Every `CREW-*` row at **Verified**. That is the surface being charged for.
- CREW-002 gated on subscription state, with a test asserting a free account is refused a second named crew. Until that exists, GAP-005 stands and there is nothing to charge for.

## Sequencing

Part A first; it is what "members-only" currently fails to mean. Part B follows. Part C is what converts "done" into "demonstrably done" and should not be deferred past the release — its absence is the reason this plan exists.
