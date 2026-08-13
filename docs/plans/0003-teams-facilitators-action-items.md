# Plan: Teams (#72) + Facilitator Role (#97) + Action Items (#88)

**Status: IMPLEMENTED (2026-07-07), awaiting human review.** All checklist items done; see `docs/STATE.md` and ADR-0006 for the shipped shape. Work lives on the **`agent-substrate`** branch (which also carries the preceding milestone: docs reorg, agent JSON API, attribution, teams/API-keys/ephemerality foundation).

**Deviations from the original plan:** (1) The dashboard create-board flow attaches the personal team automatically instead of offering a team selector — team-scoped creation lives on the team page, which keeps the NewButton dropdown simple. (2) The pre-existing dashboard bug where the Created/Updated cells were swapped was fixed in passing.

## Continuation notes (read this to pick the work up cold)

**Verification state at hand-off:**
- 317 tests passing across 41 files (`npm test`); production build clean (`npm run build`).
- `npm run typecheck`: 18 pre-existing errors only (RR7 `ActionFunctionArgs` now requires `unstable_pattern`, which the older test fixtures don't pass — tests still run green via Vitest; new tests sidestep with `as never`). Fixing the fixtures is an open chore.
- Live smoke performed against a local dev server: trial board → bulk objectives via agent bearer token (201, ordered) → anonymous GET sees items with `canFacilitate:false` → agent GET `true` → completion toggle via session cookie works → facilitators list correct → flipping `open_facilitation` live-flips anonymous `canFacilitate`. Board page 200, `/app/teams` 302-redirects unauthenticated, `/llms.txt` 200.
- Smoke-test boards exist only in the **local dev database** (throwaway).

**Human review punch list (not yet done):**
1. Eyeball in a real browser (API + component tests passed, but no human has seen it): the Mission Objectives panel (progress track, checkbox fill, collapse), the Crew Access modal (toggle, grant/revoke, Commander chip), the Teams pages, and the new dashboard columns (Team, Objectives) in light + dark mode, desktop + mobile.
2. Facilitator flow end-to-end with two real users (grant by username needs a second registered account).
3. `open_facilitation` hands real power (locks, column deletion, granting facilitators) to anonymous participants by design — confirm the modal copy is explicit enough.
4. Decide whether facilitators-managing-facilitators (per issue #97 "any way I can") matches intent, or should tighten to owner-only.

**Known caveats:**
- Dashboard `role='team'` is a presentation-only pseudo-role from a COALESCE — never write it to `board_members`.
- Any session user can un-check another's completed objective (v1 tradeoff; per-item assignees are the refinement, see ADR-0006).
- Team action items have no attribution display yet.

**Natural next steps (in rough priority):** billing integration + free-vs-paid gating (#59, critical path per the roadmap-board prioritization), trial-board claim flow, webhooks/MCP server for agents, per-key API scopes, the typecheck fixture chore.

## Context

The Teams + API Keys foundation (ADR-0003/0004/0005) shipped the structural gate for monetization. This plan builds the three features that make it a product teams will pay for:

- **#72 Teams (now required, not deferred):** named multi-member teams; members see all team boards; team-level action items.
- **#97 Facilitator Role:** owner delegates Command Deck access per-board, or opens it to everyone.
- **#88 Actionable Action Items:** checkbox action items on each board; visible with counts on the dashboard; team-level rollup.

Together: a facilitator organizes retros across teams, delegates breakout boards to co-facilitators, and the team leaves each retro with tracked action items — the recurring-value loop that justifies a subscription.

## Decisions

1. **Roles on `board_members`:** add `'facilitator'` as a role value (existing rows are `'owner'`). Owner ⊃ facilitator abilities. Facilitators can manage other facilitators (issue: "manipulate the board in any way I can"), but can never remove the owner. Board delete/archive/duplicate stay owner-only (already enforced in model).
2. **Open facilitation:** `boards.open_facilitation BOOLEAN DEFAULT FALSE` — when true, every user (including anonymous participants) can use the Command Deck. Server-authoritative via `canFacilitate` computed in `getBoardServer`.
3. **Duplication does NOT copy facilitator grants** (issue #97 open question — safer default; re-grant on the new board).
4. **Action items live in one table** `action_items` with `board_id` XOR `team_id` (board-level vs team-level). Board items ride along in `BoardDTO.actionItems` (poll sync free). Team page shows team items + rollup of the team's board items.
5. **Action item permissions:** create/edit/delete = canFacilitate (board) or team member (team-level); toggle complete = any session user (matches note-creation openness). Lock gating stays UI-side per existing convention.
6. **Board creation now requires a team for authenticated users** — dashboard create gets a team selector defaulting to the personal team. Anonymous/trial flows stay teamless (ADR-0005 unchanged).
7. **Team permissions:** owner = rename/delete team (non-personal only), add/remove members. Members = see team + boards + create/toggle/delete team action items. Personal teams: no member management, not deletable.
8. **Username lookup** reuses `findRegisteredUserByUsername` from `admin_model.ts`.
9. **API parity (ADR-0001):** `POST /api/v1/boards/:id/action-items` bulk-create for agents; board GET includes `actionItems`.
10. **Shared permission helper** `app/server/board_permissions.ts`: `userCanFacilitate(userId, boardId)` + `requireFacilitator(request, boardId)`; settings + attachments routes switch from local `requireOwner` to it.

## Design direction (frontend-design)

Extend the existing mission-control vocabulary — no new fonts/palettes:
- **FacilitatorModal = "Crew Access"**: CommandDeck glass-pod styling (backdrop-blur, rounded-2xl, gradient small-caps header), CommandDeckToggle for open-facilitation, facilitator rows with pulsing green StatusLEDs, amber "Commander" chip for the owner, add-by-username form.
- **ActionItemsPanel = "Mission Objectives"**: collapsible panel between toolbar and columns; thin green progress track filling as objectives complete; circular objective-marker checkboxes with fill transition; count chip (e.g. 3/7); inline edit on double-click; amber LED while objectives open, green when complete.
- **Teams pages**: existing dashboard/admin table + Card patterns with instrument micro-labels (CREW ROSTER / MISSION BOARDS / TEAM OBJECTIVES), personal-team chip, member-count LEDs.

## Schema (db_init blocks 26–27)

```sql
-- 26 Open facilitation: anyone on the board may use the Command Deck. See ADR-0006.
ALTER TABLE boards ADD COLUMN IF NOT EXISTS open_facilitation BOOLEAN NOT NULL DEFAULT FALSE;

-- 27 Action items: board-level (board_id) or team-level (team_id). See #88, #72.
CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  item_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_action_items_board_id ON action_items(board_id);
CREATE INDEX IF NOT EXISTS idx_action_items_team_id ON action_items(team_id);
```

## getBoardServer additions

`'openFacilitation', b.open_facilitation` · `'canFacilitate', CASE (user) → open OR role IN ('owner','facilitator') ELSE open END` · `'actionItems', json_agg subselect (id, text, completed, item_order, created_at)`.

## Files

**Create:** `app/server/action_item_model.ts` (+test), `app/server/board_permissions.ts` (+test), `app/routes/app/board.facilitators.ts` (+test), `app/routes/app/board.action-items.ts` (+test), `app/routes/app/teams.tsx` (+test), `app/routes/app/teams.$id.tsx` (+test), `app/routes/api/board.action-items.ts` (+test), `app/components/FacilitatorModal.tsx` (+test), `app/components/ActionItemsPanel.tsx` (+test), `docs/adr/0006-board-facilitation-and-action-items.md`.

**Modify:** `db_init.ts` (26–27), `board.types.ts` (ActionItemDTO, TeamMemberDTO, BoardDTO/ClientState/Actions extensions), `board_model.ts` (getBoardServer fields; facilitator fns; createBoard teamId param), `team_model.ts` (createTeam, listTeamsForUser, getTeamWithMembers, addTeamMemberByUsername, removeTeamMember, renameTeam, deleteTeam, listTeamBoards), `board.settings.ts` + `board.attachments.ts` (requireFacilitator), `BoardContext.tsx` (actionItems state/actions, canFacilitate/openFacilitation), `Board.tsx` (canFacilitate gate + panel), `BoardToolbar.tsx` (title edit gate), `CommandDeck.tsx` (Permissions button), `dashboard.tsx` (team boards, team column, action counts, team selector, fix swapped Created/Updated cells), `AccountHub.tsx` (Teams link), `routes.ts`, `docs/STATE.md`, `docs/AI_AGENT_API.md`, `public/llms.txt`, `docs/adr/README.md`.

## Permission matrix

| Action | Anonymous | Participant | Facilitator | Board owner | Team member | Team owner |
|---|---|---|---|---|---|---|
| Use Command Deck | if open_facilitation | if open_facilitation | ✓ | ✓ | — | — |
| Manage facilitators | if open | if open | ✓ | ✓ | — | — |
| Create/edit/delete board action item | if open | if open | ✓ | ✓ | — | — |
| Toggle action item complete | ✓ | ✓ | ✓ | ✓ | — | — |
| Delete/archive/duplicate board | — | — | — | ✓ | — | — |
| See team boards on dashboard | — | — | — | — | ✓ | ✓ |
| Team action items CRUD | — | — | — | — | ✓ | ✓ |
| Add/remove team members, rename/delete team | — | — | — | — | — | ✓ |

## Checklist (mirrors session task list #16–#28)

- [x] Schema blocks 26–27
- [x] Types layer
- [x] action_item_model + tests
- [x] board_permissions + facilitator model fns + getBoardServer fields + tests
- [x] team_model expansion + tests
- [x] board.facilitators + board.action-items routes + settings/attachments gate swap + tests
- [x] /app/teams + /app/teams/:id + AccountHub link + tests
- [x] FacilitatorModal + CommandDeck button + canFacilitate gating (Board, BoardToolbar)
- [x] ActionItemsPanel + BoardContext wiring + tests
- [x] Dashboard upgrade (+bugfix swapped date cells)
- [x] API parity route + llms.txt + AI_AGENT_API.md
- [x] ADR-0006 + STATE.md + adr README
- [x] Full verify: tests, typecheck, build, dev-server curl smoke
