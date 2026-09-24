# ADR-0012: Claiming a board assigns it to the claimer's personal crew

## Status

Accepted (2026-09-03) — amends §5 of [ADR-0011](0011-three-tiers-and-ownerless-anonymous-boards.md). The rest of ADR-0011 stands.

## Context

ADR-0011 §5 decided that a claimed board **stays crewless**, so that an agent which created a trial board keeps working with the same `agent_token` after a human claims it. That preserved the acquisition loop, but it left two things wrong:

1. **A claimed board was still ephemeral.** ADR-0005 auto-archives crewless boards 30 days after creation. Claiming is the moment a human says "this is mine, I want to keep it" — and it did not make the board permanent. The board would quietly age out anyway.
2. **A claimed board landed in Unassigned.** It belonged to a person but to no crew, so it sat in the dashboard's Unassigned bucket rather than the obvious default home.

## Decision

**Claiming sets `boards.team_id` to the claimer's personal crew**, in the same transaction as the `board_members` owner insert (`ensurePersonalTeam` supplies the id, creating it if somehow absent). This applies to both claim affordances — the button on the board (BRD-020) and the paste-a-link modal on the dashboard (DASH-016) — because both go through `app/routes/app/board.claim.ts`.

**Claiming does not change `open_facilitation`.** This is the deliberate difference from `moveBoardsToTeamServer`, which sets it FALSE on a crewless→crew transition. A claim must not seize a live meeting: if a retro is in progress on an anonymous board and someone claims it, everyone in the room keeps the Command Deck they already had. The new owner closes facilitation deliberately via Crew Access, which becomes available to them precisely because the board is now on a crew.

The agent-continuity guarantee of ADR-0011 §5 is unchanged, by a different mechanism: a personal crew has `restrict_board_access = FALSE`, forced off in `db_init.ts` block 31 and unsettable from the UI (ADR-0010), so `getBoardAccess` still allows anyone with the link. An agent's `agent_token` keeps working after a claim, and still first fails when the human moves the board onto a members-only crew. `app/routes/api/conversion-path.test.ts` walks that path.

## Consequences

**Positive**

- Claiming makes a board permanent. The 30-day TTL applies only to crewless boards, so the act of claiming is now the act that saves it — which is what users already believe it does.
- A claimed board has an obvious home: the claimer's personal crew, not Unassigned.
- The conversion path loses a step. ADR-0011 described "claim, then move it to your personal crew"; the claim now does both.

**Negative / load-bearing**

- A board on a crew with `open_facilitation = TRUE` is now reachable by a path other than a facilitator deliberately turning it on. That is a legal state — open facilitation is documented as available at any tier — but it means "on a crew" no longer implies "facilitation is closed." Code must keep reading `canFacilitate` rather than inferring from `team_id`.
- Claiming silently grows the claimer's personal crew. There is no confirmation step beyond the claim itself and no way to claim a board *into* a named crew; the owner moves it afterward with the existing dashboard control.
- A user who wants a claimed board to stay ephemeral has no way to ask for that. Nobody has wanted it.

## Alternatives Considered

1. **Keep the board crewless on claim (ADR-0011 §5 as written).** Rejected: it left the board on a 30-day fuse at the exact moment the human asked to keep it, which is the opposite of what claiming means to them.
2. **Force `open_facilitation = FALSE` on claim, matching `moveBoardsToTeamServer`.** Rejected: it would strip the Command Deck from everyone in a live retro the instant one participant claimed the board. Consistency with the move path is not worth breaking a meeting in progress. The owner can close it in two clicks.
3. **Ask the claimer which crew to claim into.** Rejected for now: it puts a decision in front of someone whose intent is simply "keep this." The personal crew is the safe default and moving afterward is one control away.

## References

- ADR-0011 §5 (the decision this amends), ADR-0005 (free-tier ephemerality — why crew membership means permanence), ADR-0010 (personal crews are never members-only), ADR-0003 (personal crews).
- `app/routes/app/board.claim.ts`, `app/server/team_model.ts` (`ensurePersonalTeam`), `app/routes/api/conversion-path.test.ts`.
- `docs/spec/0001-action-registry.md` — BRD-020, DASH-016, and the conversion path.
