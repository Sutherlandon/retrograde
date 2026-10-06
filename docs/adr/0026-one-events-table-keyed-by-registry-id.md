# ADR-0026: One events table, keyed by registry ID

## Status

Accepted (2026-10-06)

## Context

Logging is stdout only (issue #82). Key actions print `[METRIC]` lines, which live only as long as Vercel keeps runtime logs, so they cannot answer "did this work over the last three weeks?"

The board calls to action (BRD-021, BRD-022) were the first thing that needed that answer: how many people followed each link, and how many boards and claims followed. Two more questions are already queued behind it: which features people actually use, and whether a release's features get picked up.

The action registry (`docs/spec/0001-action-registry.md`) already lists every action in the product under a stable ID, and tests already hold it to the code.

## Decision

1. **One append-only table, `events`** (`db_init.ts` block 34): `name`, `action_id`, `user_id`, `board_id`, `team_id`, `properties` (JSONB), `created_at`.
2. **Every event is tagged with the registry ID of the action it belongs to.** Feature use is a count by `action_id`, and the registry says which feature that is. A test fails if code tags an event with an ID that is not in the registry.
3. **`recordEvent` in `event_model.ts` is the only writer.** It never throws, because losing an event must not break the request it rides on, and it also prints an `[METRIC] Event` line.
4. **Details specific to one event go in `properties`,** not new columns, so a new event never needs a schema change.
5. **No foreign keys.** The example boards have no `boards` row, and an event must outlive a deleted board, crew or user.
6. **Releases are not recorded here.** They are dated by their git tags; a release's adoption is the first events of its actions' IDs after that date.

## Consequences

**Positive**
- A new event is one `recordEvent` call: no schema change, no new table.
- "Which features are used" is answered against the registry's own inventory, with no second list to keep in sync.
- The rows live in each deployment's own database: a self-hosted instance's events stay with its operator.

**Negative / load-bearing**
- Each event is a synchronous insert on the request path. Fine at current volume; high-frequency actions (notes, votes) may need sampling or batching if that changes.
- No retention policy yet. Rows hold user and board ids indefinitely, though never note content.
- An action with no `recordEvent` call is invisible: no events does not mean unused. Coverage grows as features are wired.
- `board_claimed` is tagged BRD-020 even for a claim made from the dashboard (DASH-016), which posts to the same action.

## Alternatives Considered

1. **A table per concern** (`growth_events`, then feature events). Rejected: the same shape twice, and questions that span both need a union.
2. **A column per detail** (`result_board_id` and so on). Rejected: a schema change for every new kind of event.
3. **A hosted product-analytics service.** Not adopted: a new vendor, a client-side script, user data leaving our database, and something every self-hosted operator would have to configure or strip out. Counting by registry ID is a plain SQL query.
4. **A log drain from Vercel into a log store.** Not adopted: it keeps text lines, not rows, and adds a service to run.

## References

- `app/server/event_model.ts`, `app/server/db_init.ts` (block 34).
- `docs/spec/0001-action-registry.md` (the vocabulary of `action_id`), `docs/STATE.md` (the follow-up query).
- Issue #82 (stdout-only logging), issue #115 (tracking feature usage in `events`).
