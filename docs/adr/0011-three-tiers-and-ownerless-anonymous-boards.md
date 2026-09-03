# ADR-0011: Three tiers, ownerless anonymous boards, and where the paid line sits

## Status

Accepted (2026-09-03) — §5 amended by [ADR-0012](0012-claiming-assigns-the-personal-crew.md): a claimed board now joins the claimer's personal crew instead of staying crewless. The agent-continuity guarantee in §5 is unchanged; the mechanism is.

## Context

Crews are about to be sold. Before charging for them, three questions had no written answer, and the code answered each of them differently in different places:

1. **What are the tiers, and where is the paid line?** Earlier work gated permanence behind teams (ADR-0003, ADR-0005) and reserved a place for billing without saying what billing would gate. The draft that preceded this ADR proposed a `teams.plan` column.
2. **Who is the primitive on a board — the owner or the facilitator?** ADR-0006 decided facilitators get every board control except lifecycle, but the UI still gated two controls on `isOwner`, and three routes gated nothing at all.
3. **What is an anonymous board's owner?** Every anonymous board was stamped with one — the visitor on the homepage path, the *agent itself* on the API trial path — which made the claim flow reject every board it could reach. The product's acquisition loop (an agent creates a board, shows a human, the human keeps it) was broken at the step where the human keeps it.

`docs/spec/0001-action-registry.md` was written to audit every action against the code and surfaced nine gaps. This ADR records the decisions that closed them.

## Decision

### 1. Three tiers, named for what an account is entitled to

| Tier | Who | Boards live on | Entitles |
|---|---|---|---|
| **1 · Anonymous** | no account | no crew | Creating and using boards. No controls, no owner. 30-day TTL. |
| **2 · Registered** | free account | the personal crew | Permanent boards, the dashboard, the facilitator role, one API key. |
| **3 · Paid** | subscriber | named crews | Multi-member crews, crew action items, members-only board access, additional API keys. |

The boundary between 2 and 3 is `teams.is_personal`, which the crew route already enforces on rename, delete, add-member, and restrict. **The paid line is one action: creating a named crew.** Everything paid requires a crew that isn't personal, so gating that single action gates all of it.

**The subscription belongs to the account, not the crew.** There is no `plan` column on `teams`. `app/server/entitlements.ts` exposes `accountCanCreateNamedCrew(userId)` as the single seam; until a billing provider exists it returns `true`, and the route honors it with a test proving a `false` yields 403. When billing lands, that function body is the whole integration.

### 2. Access and entitlement are separate axes

`teams.restrict_board_access` is a tier-3 *feature*, not the tier. It defaults on for named crews (ADR-0010) and a crew may turn it off, at which point its boards are as open as an anonymous one. The permission predicate (`getBoardAccess`) knows only about access; it never consults billing state.

### 3. Facilitator is the primitive; owner is a kind of facilitator

Every control on a board is designed for the facilitator role. The owner is a facilitator who additionally holds lifecycle rights — delete, archive, duplicate, move — and cannot be demoted. `isOwner` is the correct gate only for those lifecycle controls, which live on the dashboard. On a board page, the gate is `canFacilitate`; reaching for `isOwner` there is the smell.

This is ADR-0006's decision. What is new is enforcement: title, timer, add/delete column, and column prompts now require `requireFacilitator` on the server, and the two UI controls that gated on `isOwner` gate on `canFacilitate`.

### 4. Anonymous boards have no owner, and everyone on them is a facilitator

A board with `team_id IS NULL` has **no owner row** and `open_facilitation` is **invariantly TRUE**. Both are set at creation, the invariant is enforced on write (the open-facilitation toggle is refused on a crewless board), and a one-time gated reset in `db_init.ts` brings existing boards into line without touching registered users' owner rows.

The two must ship together: `canFacilitate` is `open_facilitation OR role IN ('owner','facilitator')`, and the creator's owner row was the only thing granting the Command Deck on an anonymous board. Dropping the owner alone would have left tier 1 with no facilitation at all.

Moving a board onto a crew closes facilitation to the role; moving it off a crew reopens it; crew-to-crew preserves the facilitator's choice.

### 5. Claiming, and the continuity an agent is promised

Any registered user may claim a board that has no owner — from the board itself (the primary affordance) or by pasting a link on the dashboard. A claimed board stays crewless and open, so **an agent that created it keeps working with the same token**. Its token first fails when the human moves the board onto a members-only crew, which is the moment the human has asked for control. A test walks that path end to end; breaking it silently would cost more than the paywall earns.

### 6. One API key is free; the second is paid

Applying ADR-0008 ("API keys are AI crew members") uniformly: a personal crew is a crew of one — the human plus one agent — and may hold one active key. A second member is tier 3 whether that member is human or AI. The cap is enforced in the model layer so the API cannot bypass it.

The key's job at tier 2 is not entry — a crewless board needs no key — it is permanence and identity: boards created with a key live on the human's dashboard instead of expiring, and carry a named agent. The cap limits fleet size, not volume; metering activity is a separate lever (issue #105).

### 7. Locks are enforced on the server, and facilitators do not bypass them

`notes_locked` and `board_locked` were UI conventions. They are now checked in the note, column, title, timer, and action-item routes, mirroring exactly what the UI disables. Settings stay unguarded by locks because that is how a board is unlocked.

### 8. The registry is the spec, and a test keeps it honest

`docs/spec/0001-action-registry.md` is the canonical inventory. A linkage test parses it and fails if a row marked **Verified** has no test naming its ID, or if a test names an ID whose row is not marked Verified. The status column therefore cannot drift from the suite in either direction. A permission-matrix suite asserts every server-enforced action × every actor resolves to an explicit allow or deny, and a row with no assertion is a failure rather than a silent hole.

## Consequences

**Positive**
- One payment gate, one seam, no schema for billing until billing exists.
- The tier model is fully described by two existing columns and one primitive, so it can be stated in a paragraph and tested in a table.
- The acquisition loop works: agent creates, human claims, agent continues, human pays for control.
- Anonymous boards are what the marketing says they are — no owner, no controls, link is access.

**Negative / load-bearing**
- Existing anonymous boards lose their (anonymous) owner rows in a one-time reset. Nothing observable changes for those boards, because facilitation is opened at the same time, but the reset is a data mutation and follows ADR-0009's gated pattern so it cannot re-run.
- A registered user who deliberately un-assigns a board from every crew makes it tier 1 again: open facilitation, and claimable by anyone registered if they were not its owner. That is the model, not a bug, and the dashboard's Unassigned view is where such boards surface.
- The one-key cap will surprise a free user who wants two agents. The refusal copy tells them the path. This is the intended conversion moment.
- Server-side lock enforcement makes a stale client fail on a freshly locked board instead of silently succeeding. The client already handles a 4xx on those fetchers.

## Alternatives Considered

1. **`teams.plan` column.** Rejected: a crew is paid by virtue of being a named crew; the subscription is the account's. A per-crew plan would drift from `is_personal` the first time they disagreed, and would put billing state into the permission predicate.
2. **Tier defined by `restrict_board_access`.** Rejected: a named crew that turns restriction off is still paid. Conflating the switch with the tier made "tier 3 board" mean two things.
3. **Paywall at API key minting.** Rejected: it walls off the moment of highest intent (the human just claimed their agent's board), and it does not touch volume — one key can write without limit, and the unauthenticated trial path needs no key at all. See #105.
4. **Keep the anonymous creator as owner and relax the claim predicate.** Rejected: an anonymous owner can never be re-identified, so the row was a lock nobody held the key to. Removing it is what makes "no owner" true rather than nominal.
5. **Owner as the primitive, facilitator as a delegated subset.** Rejected: a model rooted in ownership has nothing to say about tier 1, where there is no owner. Rooted in facilitation, tier 1 is "everyone is a facilitator" and falls out of the same primitive as the other two.
6. **Locks as UI-only.** Rejected: a lock a direct request can write through is not a lock.

## References

- ADR-0003 (teams as billing unit), ADR-0005 (free-tier ephemerality), ADR-0006 (facilitation), ADR-0008 (API keys are crew members), ADR-0009 (gated one-time resets), ADR-0010 (members-only crew boards).
- `docs/spec/0001-action-registry.md` — the inventory this ADR closes gaps in.
- `app/server/board_permissions.ts`, `app/server/entitlements.ts`, `app/server/db_init.ts` (block 32).
- GitHub issues #59 (paywall), #87 (AI native), #105 (agent metering).
