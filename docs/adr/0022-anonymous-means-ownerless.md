# ADR-0022: A board is anonymous when it has no owner, not when it has no crew

## Status

Accepted (2026-09-16) — amends [ADR-0011](0011-three-tiers-and-ownerless-anonymous-boards.md) §4, which tied open facilitation to `team_id IS NULL`, and the matching consequence that un-assigning a board makes it tier 1 again. The rest of ADR-0011 stands, and so does [ADR-0012](0012-claiming-assigns-the-personal-crew.md).

## Context

ADR-0011 §4 treated "crewless" and "anonymous" as the same thing. On a new board they are: a crewless board is created with no owner row. They stop being the same once older data is involved. Every board created before 2.0 is crewless (ADR-0009 reset them all to Unassigned), and a registered user's owner row on one of those boards was deliberately kept.

The code keyed three rules on the crew anyway:

1. Crew Access called any crewless board anonymous and hid the facilitator roster, the grant form and the open-facilitation toggle, so the owner of an existing board could not assign a facilitator.
2. The open-facilitation toggle was refused on every crewless board, so the owner could never close the Command Deck.
3. `db_init.ts` block 32, which has not yet run in production, would have opened facilitation on every crewless board, including those with a registered owner. Moving a board off a crew also reopened it.

The reason for the invariant is that an ownerless board has no role left to reach the Command Deck if facilitation closes. An owned board always has one: its owner.

## Decision

1. **A board is anonymous if and only if it has no owner row.** Its crew does not matter.
2. **Only an ownerless board has its facilitation locked open.** `setOpenFacilitationServer` refuses to close facilitation when no owner row exists; the guard stays in the SQL `WHERE` clause.
3. **Crew Access decides by `hasOwner`.** An owned board gets the roster, the grant form and the toggle whether or not it is on a crew. An ownerless board keeps the explanation and the claim prompt, and claiming it unlocks Crew Access.
4. **Moving a board never changes `open_facilitation`.** Only an owner can move a board, so every moved board is owned, and its facilitation stays the facilitator's choice.
5. **Block 32 opens only boards left without an owner.** After it removes anonymous and agent owner rows, it sets `open_facilitation = TRUE` on a crewless board only if no owner row remains. Boards with a registered owner keep their setting.

New boards are unchanged: a crewless board is still created with no owner and open facilitation.

## Consequences

**Positive**
- The owner of an existing board can grant and revoke facilitators and close the Command Deck without first moving the board to a crew.
- The release does not silently open the Command Deck to everyone on registered users' existing boards.
- The claim path and the move path now agree: neither changes facilitation.

**Negative / load-bearing**
- A crewless board can have an owner. The registry's old claim that no code path produces one is withdrawn.
- Un-assigning a board from every crew no longer makes it tier 1. It keeps its owner and its facilitation setting, it cannot be claimed, and it is still subject to the ADR-0005 TTL, since that keys on the crew, with existing boards protected by the ADR-0019 cutoff.
- A board moved onto a crew stays open if it was open. Its owner closes it in Crew Access.

## Alternatives Considered

1. **Assign every existing owned board to its owner's personal crew.** Rejected. It is a bulk data change to work around a UI rule. ADR-0009 deliberately left those boards Unassigned for their owners to sort.
2. **Keep the crew rule, but exempt boards created before the release.** Rejected. It adds a date to a permission rule, where "does this board have an owner?" already gives the right answer.

## References

- ADR-0006 (facilitation), ADR-0009 (the Unassigned reset), ADR-0011 §4, ADR-0012 (claiming), ADR-0019 (grandfather cutoff).
- `app/server/board_model.ts` (`setOpenFacilitationServer`, `moveBoardsToTeamServer`), `app/components/FacilitatorModal.tsx`, `app/server/db_init.ts` (block 32).
- Registry DECK-022, DASH-010, DASH-011.
