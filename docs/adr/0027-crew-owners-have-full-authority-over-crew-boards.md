# ADR-0027: Crew owners have full authority over every board on their crew, and agents edit boards over the JSON API

## Status

Accepted (2026-10-17) — amends [ADR-0006](0006-board-facilitation-and-action-items.md) §1, which made facilitation a role on `board_members` alone and kept board lifecycle with the owner alone. The rest of ADR-0006 stands, including that the owner can never be removed. Issue #118.

## Context

On 2026-10-16 an agent holding a crew API key kept a board of open work items on a self-hosted instance. It could create the board and add notes, and nothing else. It could not delete a note to close an item, rename the board, change a column, or grant a facilitator. Every one of those is a browser resource route that resolves its caller from the session cookie, so a bearer key was redirected to `/auth/login`.

The human who minted the key, the crew's owner, could not help either. Boards an API key creates are owned by the key's agent (API-001). Facilitation was `open_facilitation OR board_members.role IN ('owner','facilitator')`, so the crew's owner had no facilitator rights to the board, and board lifecycle was owner-only (ADR-0006), so they could not delete it. The agent abandoned the board, and it still exists.

ADR-0008 makes a key an AI crew member that only the crew's owner can mint or revoke, and the crew's owner is the person who pays for a named crew and adds and removes its members. The crew owner already controls everyone who can create a board on the crew; the board model did not reflect that.

## Decision

### 1. The owner of a board's crew has full authority over it

On every board on their crew, whoever owns it — a crewmate, an agent, or themselves — the crew's owner can do everything the board's owner can:

- **Facilitate:** `canFacilitate = open_facilitation OR board_members.role IN ('owner','facilitator') OR team_members.role = 'owner'` for the board's `team_id`.
- **Manage the board as an object:** delete, archive, unarchive, duplicate, and move it (to a crew they belong to, as for an owner), singly or in bulk.

The one thing that stays with the owner is the owner row itself: it still cannot be removed (ADR-0006). The crew owner doesn't need to remove it, since everything it grants, they already have.

The authority is derived from the crew, not written to `board_members`. It holds on boards that existed before this decision, follows a board that moves to another crew (and ends when a board leaves the crew), and is not something a facilitator can revoke from the Crew Access modal. A crewless board has no crew owner, so its owner alone manages it.

Both predicates are written once, in `app/server/board_permissions_sql.ts`. `canFacilitateSql` feeds `userCanFacilitate`, `getBoardServer`'s `canFacilitate`, and the action-item lists' `can_manage`. `canManageBoardSql` feeds every lifecycle write in `board_model.ts` and the dashboard row's `can_manage`, which decides the row's actions menu and whether it can be bulk-selected.

### 2. Personal and named crews alike

On a personal crew the owner is the only human member, and the only other creators are their own agents, so the rule changes nothing for other people. On a named crew it makes the person who pays for the crew its administrator.

### 3. People and agents are held to one set of rules

Wherever an action exists on both surfaces, the browser route and its JSON API counterpart decide it the same way:

- **One caller per request.** Every board route resolves its caller with `getApiUser` (API key, then `agent_token`, then session), in `requireBoardAccess`, in `requireFacilitator`, and for the actor a write records. Before this, a browser route checked access for an API key's agent and then resolved facilitation and authorship from the session alone, so a key's note could be written with no author, which breaks ADR-0002.
- **Board access before facilitation on every write.** Settings, attachments, facilitators and action items in the browser now check access first, as the API and the browser's title, timer and column routes already did. Open facilitation never admits a caller from outside a members-only board's crew.
- **Writes stay on the board in the URL.** Every note and column write, on both surfaces, matches only rows on that board in SQL.
- **The same length limits.** One table, `app/config/board_limits.ts`, is enforced by both surfaces and set as `maxLength` on the inputs.
- **The same read.** The browser's poll and the API's `GET` return one snapshot (`board_snapshot.ts`): the board as the caller sees it, its attachments, and a timer that has run out marked stopped.

A browser route called with an API key now behaves exactly as for a signed-in person. That doesn't make it part of the agent contract: section 4's JSON routes are.

### 4. Agents make board writes through `/api/v1`, under the browser's rules

The agent API gains renaming a board, editing, moving and deleting notes, adding, renaming, re-prompting and deleting columns, and listing, granting and revoking facilitators (API-008 – API-017). Each route applies its browser counterpart's rule: participant-level actions need board access, facilitator controls need facilitation, and each lock blocks what it blocks in the browser. Board access is checked before facilitation, so open facilitation never admits a caller from outside a members-only board's crew (GAP-008's rule). The routes take JSON, answer with the board JSON (or the facilitator list), and fail as `{ error: { code, message } }`. The shared guards live in `app/server/api_board_guard.ts`.

Every write is scoped in SQL to the board in its URL. An id from another board matches nothing and answers `404`.

## Consequences

**Positive**

- A crew owner can run, rename, reorganize and clean up every board on their crew. No board on a crew is ever stranded: when its owner is an agent whose key was revoked, or a member who left, the crew owner still has every right the owner had. That also settles the stranding half of issue #106.
- An agent with a key can close the items it tracks, restructure its boards, and hand facilitation to a human, without a human touching the UI.
- A rule changed for one surface has a single place to change: one caller resolver, one pair of guards, one limits table, one snapshot.
- One SQL predicate means the Command Deck, the action-item lists and the mutation guards cannot disagree about who facilitates.

**Negative / load-bearing**

- A crew owner can change, move or delete any board on their crew, including one a crewmate created and is running. That is the intended authority of the person who pays for the crew. A crewmate who wants a board only they control keeps it on their personal crew.
- The crew owner's facilitation does not appear in the board's facilitator list, because it is not a grant. Someone reading Crew Access sees fewer facilitators than there are.
- Agents are anonymous users (`is_anonymous = TRUE`), and granting a facilitator looks up registered users only, so a human still cannot grant facilitation to an agent on a board the agent doesn't own. Out of scope here.
- A key from another crew can still edit and delete notes on a board whose crew is not members-only, as any visitor with the link can in the browser. Members-only boards refuse it everything.

## Alternatives Considered

1. **Write a facilitator row for the crew owner when a board is created** (issue #106's first decision). Rejected: it misses every existing board, including the stranded one, without a backfill; the row goes stale when a board moves crews; any facilitator could revoke it (DECK-021), so an agent could lock its own crew owner out; and every creation path has to remember to write it.
2. **Make the crew owner the owner of boards an agent creates.** Rejected: the agent would lose the lifecycle rights it has today over its own boards, and API-001's documented behavior would change for every existing integration.
3. **Give the crew owner lifecycle rights only over boards their crew's agents own,** keeping ADR-0006's protection of a human owner's board. Rejected: a crew's owner answers for everything on the crew, and a board left behind by a member who leaves is as stranded as an agent's.
4. **Make the browser resource routes the agent interface.** Rejected: those routes take form data, answer with turbo-stream payloads, and expect client-generated ids. The JSON API is the agent contract (ADR-0001, `docs/AI_AGENT_API.md`). The browser routes still resolve the caller the same way the API does (section 3), so they never give one request two identities.
5. **Keep the browser's facilitation check on the session alone.** Rejected: a request would have two identities, and a key's writes through a browser route would be unattributed.

## References

- Issue #118 (this decision), issue #106 (reassigning ownership when a member leaves, still open).
- ADR-0001 (agents are first-class), ADR-0004 and ADR-0008 (API keys are crew members), ADR-0006 (facilitation), ADR-0010 (members-only crews), ADR-0021 (self-hosted instances have no guests).
- `app/server/board_permissions_sql.ts`, `app/server/board_permissions.ts`, `app/server/api_board_guard.ts`, `app/server/board_model.ts`, `app/routes/api/`.
- `docs/spec/0001-action-registry.md` — DECK section, DASH-006 – DASH-012, API-008 – API-017.
