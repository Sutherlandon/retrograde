# ADR-0006: Facilitation is a delegable board role; action items are first-class board/team records

## Status

Accepted (2026-07-07)

## Context

Until now, "facilitator" and "board owner" collapsed to the same person: only the owner could use the Command Deck. Issue #97 asks for delegation — an owner runs the meeting while a co-facilitator drives the board, or breakout boards are handed to session leaders. Issue #88 asks for action items that survive the retro as a checklist. Issue #72 (multi-member teams, shipped alongside this ADR on the ADR-0003 foundation) asks for team-level visibility and team-level action items.

These three interlock: teams make delegation targets discoverable, facilitation makes delegation real, and action items are the recurring-value artifact that brings people back — the loop that justifies a paid team.

## Decision

### 1. Facilitation is a role on `board_members`, plus an open mode

- `board_members.role` gains `'facilitator'` alongside `'owner'`. Owner abilities ⊃ facilitator abilities.
- `boards.open_facilitation BOOLEAN DEFAULT FALSE`: when true, **everyone** on the board (including anonymous participants) may facilitate.
- The server-authoritative check is `canFacilitate = open_facilitation OR role IN ('owner','facilitator')`, computed per-user in `getBoardServer` and enforced in mutation routes via `app/server/board_permissions.ts` (`userCanFacilitate` / `requireFacilitator`, returning 401 for sessionless callers and 403 for unauthorized ones).
- Facilitators can do everything the owner can on the board surface — settings, locks, timer, attachments, title, action items, and managing other facilitators — per the issue's "manipulate the board in any way I can." Two exceptions stay owner-only: board lifecycle (delete/archive/duplicate, enforced in the model layer) and removing the owner (impossible: removal is scoped to `role = 'facilitator'`).
- **Duplicating a board does not copy facilitator grants.** Grants are per-board trust decisions; re-grant on the copy. (Resolves the issue's open question toward the safer default.)

### 2. Action items are rows, not notes

A dedicated `action_items` table (`board_id` XOR `team_id`) rather than a special note type:

- Board-level items ride along in `BoardDTO.actionItems`, so the existing polling loop syncs them with zero new plumbing, and the agent-facing `GET /api/v1/boards/:id` exposes them automatically (ADR-0001 parity). Bulk creation for agents: `POST /api/v1/boards/:id/action-items`.
- Team-level items live on the team page, with a read-only rollup of the team's open board items next to them.
- Permissions: facilitators create/edit/delete; **any session user can toggle completion** — checking off your own follow-up must not require a role.

### 3. Dashboard and team surfaces reflect membership, not just ownership

- Dashboard shows boards you're a member of **or** that belong to your teams (role shown as `team` when you're not a board member), with open-objective counts.
- Authenticated board creation always lands on a team (personal team by default; team page creates under that team). The anonymous trial flow stays teamless (ADR-0005 unchanged).

## Consequences

**Positive:**

- The owner can finally hand off the deck mid-meeting or pre-delegate breakout boards; `open_facilitation` is the zero-friction variant for high-trust rooms.
- Action items give retros a persistent output. The amber "N open" count on the dashboard is the pull-back-in signal, and team rollups give facilitators a cross-board view.
- Agents can seed objectives programmatically (roadmap-triage boards can end with the agent proposing the follow-ups).

**Negative / load-bearing:**

- `open_facilitation` gives anonymous participants real power (locks, deletion of columns, granting facilitators). That is the documented intent of the toggle — it defaults off and the modal copy says exactly what it does.
- Facilitators managing facilitators means a facilitator can revoke another facilitator. Accepted per the issue's "any way I can" scope; the owner is immune to removal.
- The `role='team'` dashboard pseudo-role is presentation-only — it must never be written to `board_members`.
- Toggle-completion being open to any session user means a participant can un-check a facilitator's item. Acceptable for v1; per-item assignees would be the future refinement.

## Alternatives Considered

1. **Facilitators as a separate `board_facilitators` table.** Rejected: `board_members.role` already models per-board roles; a second table duplicates the unique constraint and the joins.
2. **Action items as a special column of notes.** Rejected: items need completion state, team-level scope, and dashboard aggregation — none of which fit the note model without polluting it.
3. **Copying facilitator grants on duplication.** Rejected as the default (see above); can become an option later without schema change.
4. **Owner-only facilitator management.** Rejected: contradicts the issue's full-access framing and blocks the breakout-board handoff (the delegate must be able to onboard the next delegate).

## References

- Issues #97 (Facilitator Role), #88 (Actionable Action Items), #72 (Teams).
- ADR-0003 (teams), ADR-0005 (trial-flow boards stay teamless), ADR-0001 (API parity → the bulk action-items endpoint).
- `app/server/board_permissions.ts`, `app/server/action_item_model.ts`, `app/server/board_model.ts` (facilitator functions + `getBoardServer` fields).
- `docs/spec/0001-action-registry.md` — the full permission surface, action by action.
