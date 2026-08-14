# ADR-0009: Boards are never auto-attached to a team; a one-time reset returns pre-launch boards to Unassigned

## Status

Accepted (2026-07-23)

## Context

ADR-0003 shipped a startup backfill (`runPersonalTeamBackfill`, called from
`initializeDatabase()` on every server boot) with two jobs: (1) create a
personal team for any registered user who lacked one, and (2) attach any
board with `team_id IS NULL`, owned by a registered user, to that user's
personal team. At the time, this was reasonable — it was the only way to
retroactively onboard pre-teams boards onto the new model.

Two things changed since:

1. **Team creation moved to login.** `ensurePersonalTeam(userId)`
   (`app/server/team_model.ts`) now runs on every login
   (`app/routes/auth/callback.ts`), so every registered user has a personal
   team from their first sign-in onward. Job (1) of the backfill became
   dead weight — a user can't reach `initializeDatabase()`'s effects without
   having already logged in and triggered `ensurePersonalTeam` themselves.

2. **"Unassigned" became a real, intentional state**, not just a transient
   pre-migration condition. The dashboard's Unassigned filter,
   `SortBoardsBanner`, bulk move-to-crew, and — most concretely — crew
   deletion (ADR-0007's Danger Zone: deleting a crew sets its boards'
   `team_id` to `NULL` via `ON DELETE SET NULL`) all rely on a board being
   able to sit teamless *on purpose*.

Job (2) of the backfill never learned about that second change. It re-ran
on every server restart and matched its `WHERE b.team_id IS NULL` clause
unconditionally — so any board a user (or the system) deliberately left
teamless got silently re-claimed into their personal team the next time the
server rebooted. This was discovered directly: a crew was deleted through
the new Danger Zone flow, its two boards correctly went to Unassigned, and
then a routine dev-server restart (for unrelated UI verification) silently
reassigned them back to Personal before the owner had a chance to choose.

Teams/crews are still pre-launch (no real users depend on today's
board-team associations — see ADR-0007's rename discussion), which makes
this the right moment to also reset the *data*, not just the code: any
`team_id` a board holds today is either a real choice or a leftover from the
now-removed auto-claim bug, and there's no way to tell those apart after the
fact. Since nothing is riding on today's associations, the correct launch
state is "every board starts Unassigned; owners choose."

## Decision

1. **Delete `runPersonalTeamBackfill` entirely** (both the team-creation and
   board-reattachment steps) and its call in `initializeDatabase()`.
   Personal-team creation is fully covered by `ensurePersonalTeam` at login;
   board-team attachment must always be an explicit, user-initiated action
   (board creation under a crew, or a move/bulk-move) — never a background
   sweep.

2. **One-time reset, gated so it can never re-run**, added as the next
   `db_init.ts` migration step:

   ```sql
   ALTER TABLE boards
   ADD COLUMN IF NOT EXISTS team_assignment_finalized BOOLEAN NOT NULL DEFAULT FALSE;

   UPDATE boards
   SET team_id = NULL, team_assignment_finalized = TRUE
   WHERE NOT team_assignment_finalized;

   ALTER TABLE boards
   ALTER COLUMN team_assignment_finalized SET DEFAULT TRUE;
   ```

   This follows the same 3-step idempotent pattern already used elsewhere in
   `db_init.ts` (see the `notes.created`/`note_order` migrations): add a
   column defaulting `FALSE` so every existing row is in scope once, do the
   one-time work while flagging each row `TRUE`, then flip the column
   default to `TRUE` so every board created from this point forward —
   which always gets an explicit `team_id` at creation time in
   `dashboard.tsx`/`crews.$id.tsx` — is automatically exempt from ever being
   touched by this step again, including on subsequent restarts.

3. **No new "guide" UI needed.** `SortBoardsBanner` + the dashboard's
   Unassigned filter already exist for exactly this situation ("N boards
   haven't joined a crew yet... Sort boards now") and were verified to
   surface correctly for the reset boards without any changes.

## Consequences

**Positive:**

- Deliberately unassigning a board (crew deletion, explicit "move to no
  crew") now sticks — permanently, across restarts — instead of being
  fought by a background job.
- One less startup side effect; `initializeDatabase()` no longer mutates
  ownership data on every boot, only schema.
- The reset happens once, at a moment when no real user depends on prior
  associations, rather than as an ongoing behavior that would need to keep
  guessing "was this teamless on purpose?" forever.

**Negative / load-bearing:**

- This is a real, if currently harmless, data change: every board in every
  environment this migration runs against goes Unassigned once. Fine
  pre-launch; if this ADR is ever revisited post-launch, the *removal* of
  the backfill is still correct but the *reset* step should not be
  reapplied (it already ran, is gated, and won't re-run — but don't copy
  the reset UPDATE into a new migration without the same gating).
- `team_assignment_finalized` is a permanent column now load-bearing for
  every future board — any code path that bulk-inserts boards directly
  (bypassing `createBoard()`) must not rely on the old default-`FALSE`
  behavior; new rows get `TRUE` automatically via the column default, which
  is what we want (never eligible for the retired auto-claim), but a
  future migration reusing this column for a different purpose needs to
  know it's now a "done, don't touch" flag, not a "pending" flag.

## Alternatives Considered

1. **Keep the backfill, just gate step 2 on a per-board flag going
   forward (don't reset existing data).** Rejected: today's team_id values
   are inseparably a mix of "the bug re-claimed this" and "nothing to do
   with it" — there's no way to tell which boards were ever deliberately
   assigned versus swept up by the bug. Since we're pre-launch, resetting
   is strictly more honest than keeping data whose provenance we can't
   verify.
2. **Only fix the immediate crew-deletion conflict (special-case boards
   whose team was just deleted) and leave the general backfill running.**
   Rejected: narrower fix, same root cause remains for the next feature
   that wants a board to be legitimately teamless (e.g. a future explicit
   "remove from crew" action already exists via `BoardActionsMenu`/
   `BulkActionsBar` — those would have hit the same bug).
3. **Drop the gate column; just delete the reattachment UPDATE and leave
   whatever team_id values exist today as-is.** Simpler, no reset. Rejected
   per the user's explicit direction: the correct "at launch" state is
   Unassigned-by-default with the user choosing, not "whatever a buggy
   backfill happened to leave behind."

## References

- ADR-0003 (teams as billing unit) — introduced the original backfill this
  ADR removes.
- ADR-0005 (free-tier ephemerality) — the sibling "boards can be teamless on
  purpose" concept (trial-flow boards), unaffected by this change (still
  gated on `is_anonymous`, never touched by the removed backfill or by this
  reset's owner-scoping — though the reset UPDATE clears `team_id` for all
  boards, anonymous trial boards already had `team_id IS NULL` and are
  unaffected).
- ADR-0007 (crew page absorbs the dashboard's per-crew filter) — the Danger
  Zone delete flow whose behavior surfaced this bug.
- `app/server/db_init.ts` (migration removed + added), `app/server/team_model.ts`
  (`ensurePersonalTeam`), `app/routes/auth/callback.ts` (call site),
  `app/components/SortBoardsBanner.tsx` (the pre-existing guide message that
  needed no changes).
