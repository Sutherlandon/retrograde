# Dashboard as a Team-Level View + Board→Team Triage

**Date:** 2026-07-17 · **Branch:** `agent-substrate` · **Status:** Built, awaiting human review

## What was built

Reimagined `/app/dashboard` as a team-centric mission control, plus the board→team
sorting machinery that smooths the free→paid "No Team → Teams" transition.

### Dashboard composition (top to bottom)
1. **Crew selector — lives in the sidebar** (`CrewSelector` in `Sidebar.tsx`), not
   on the page, so it's reachable from every app screen. Rows: All Boards / one
   per crew / **Unassigned** (amber, only when teamless boards exist). Selection
   persists in `?team=<id|unassigned>` on the dashboard; crew CRUD lives at
   `/app/teams` via the "Crews" item in the main nav. Data (`teams` + `unassignedCount` via
   `countUnassignedBoardsForUser`) loads in `AppLayout`'s loader. When filtered,
   the dashboard shows a "Crew: <name> · Show all" indicator under the heading
   (matters on mobile, where the sidebar hides behind the hamburger).
   *(Originally shipped as an on-page chip rail — `TeamFilterRail`, since deleted.)*
2. **Sort-boards banner** (`SortBoardsBanner.tsx`) — conversion nudge shown when
   unassigned boards exist. CTA jumps to the Unassigned filter. Dismissal is
   remembered *per count* (localStorage), so it returns only when the situation
   changes — helpful, never naggy.
3. **Open action items strip** (`DashboardActionItems.tsx`) — every open item the
   user can see (team-level → links to team; board-level → links to board),
   filtered by the active chip. An item's effective team = `ai.team_id ?? board.team_id`.
4. **Boards table** (`DashboardBoardsTable.tsx`) — bulk-select checkboxes (owners
   only; disabled otherwise), amber "Unassigned" chip in the Team column, green
   open-item badges, default sort now **Recently Updated**.
5. **Bulk actions bar** (`BulkActionsBar.tsx`) — floating Command-Deck-styled bar
   when a selection exists: move-to-team (select + confirm) and delete (confirm,
   "cannot be undone"). The bar itself morphs into the confirm prompt.

### Per-row move
`BoardActionsMenu` gains a "Move to Team" submenu (owner-only, dashboard-only via
optional `teams`/`currentTeamId` props): destination teams minus the current one,
plus "Remove from team" when assigned.

### Server
- `moveBoardsToTeamServer(boardIds, teamId|null, userId)` — single UPDATE; ownership
  and target-team membership enforced **in SQL**; returns actually-moved ids.
  Handles single + bulk (intents `moveBoard`, `bulkMove`; `teamId: "none"` → NULL).
- `bulkDeleteBoardsServer(boardIds, userId)` — one transaction; deletes only owned
  boards (notes → columns → members → board); returns deleted ids.
- `listOpenActionItemsForUser(userId)` — open items across the user's teams and
  owned boards (covers unassigned), with team/board context for linking.
- Dashboard loader now also returns `teams` (`listTeamsForUser`) and `openItems`.

## Key decisions
- **Claimed boards stay teamless on purpose.** The claim flow leaves `team_id NULL`,
  so claimed boards surface in the Unassigned chip + banner and the user sorts them
  intentionally (possibly in bulk) rather than having them silently dumped into the
  personal team. This *is* the anonymous→paid conversion path.
- **Deleting a team keeps its boards** (FK `SET NULL`) — they reappear under
  Unassigned, visible and recoverable, instead of vanishing.
- **Permissions live in SQL** (project convention): non-owned boards are silently
  skipped by bulk ops and their checkboxes are disabled in the UI.
- Team CRUD itself already existed (`/app/teams`, `/app/teams/:id` — create, rename,
  delete, membership); the dashboard rail links into it rather than duplicating it.

## Verification
- 374 tests passing (48 files); new coverage: rail, banner, strip, table, bulk bar,
  menu submenu, model fns, loader/action intents.
- Authenticated curl smoke test: dashboard 200 with new sections SSR-rendered;
  `moveBoard` intent round-tripped a real board to Unassigned and back (real SQL).
- Not yet human-verified in a browser (owner does visual review).

## Follow-ups / open questions
- `docs/STATE.md` is stale (last updated 2026-05-23, says 173 tests) — needs a
  refresh pass that also covers the agent-substrate arc.
- Consider surfacing the Unassigned chip's count in the sidebar Dashboard link.
- Mobile: the bulk bar is `fixed bottom-6` — fine on phones, but overlaps the
  Command Deck pill *only* on board pages (not dashboard), so no conflict today.
