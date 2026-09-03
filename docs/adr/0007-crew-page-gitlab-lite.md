# ADR-0007: Crew page absorbs the dashboard's per-crew filter (GitLab-lite)

## Status

Accepted (2026-07-23)

## Context

Two pages showed overlapping data with diverging UIs: the dashboard's `?team=<id>`
filter (`/app/dashboard?team=X`) and the crew detail page (`/app/teams/X`). Both
listed "this crew's boards" and "this crew's action items," but only the dashboard
kept getting polish — a bulk-select board table with move/archive/delete, and a
refined `DashboardActionItems` component (undo, inline edit, delete-confirm,
pills, exit animation). The crew page stayed a bare 3-column table with an
instant-toggle item list and no edit UI.

As long as two implementations of "a crew's boards" and "a crew's action items"
existed, they would keep drifting — every future polish pass on one would need a
matching pass on the other, or the drift compounds. Crews are also slated to
become the billing/authorization unit (ADR-0003), so the crew page will only
grow in importance relative to the dashboard's crew filter.

Teams/crews had not shipped to any user yet, which removed backward-compatibility
as a constraint on the URL rename.

## Decision

**Make the crew page (`/app/crews/:id`) the single, refined home for one crew's
data, built from the dashboard's own components — not a second implementation.**
The dashboard drops its per-crew filter entirely; it keeps only the "Unassigned"
triage filter, since Unassigned isn't a crew entity.

1. **Extract shared logic instead of duplicating it.**
   - `handleBoardMutation()` (`app/server/board_actions.ts`) — one function
     covering `duplicate | delete | archive | unarchive | moveBoard | bulkMove |
     bulkDelete`, called from both the dashboard action and the crew-page action.
   - `listVisibleBoards(userId, { teamId?, archived?, order? })`
     (`app/server/board_model.ts`) — one query; the dashboard omits `teamId`
     (its original dashboard-wide visibility clause), the crew page passes its
     own id.
   - `listOpenActionItemsForTeam(teamId, userId)` (`app/server/action_item_model.ts`)
     mirrors the dashboard's `listOpenActionItemsForUser` but scoped to one crew.
   - `DashboardBoardsTable` and `DashboardActionItems` gained small **optional**
     props (`showCrewColumn`, `defaultExpanded`, `onAddItem`, `scopedTeamId`) so
     the crew page reuses them as-is instead of forking a second board table or
     item list. Dashboard call sites are unaffected — every new prop defaults to
     prior behavior.

2. **Crew page action items are an open-only rollup, not a full checklist.**
   Reuses `DashboardActionItems` verbatim: completing an item animates it away.
   There is no completed-items view on the crew page — to un-complete an item,
   open the board it came from. Rejected a full checklist with visible completed
   items as unnecessary surface area for a page whose job is "what's still open."

3. **Crew page boards have full parity with the dashboard**, not a lighter
   read-mostly table: bulk-select, move-to-crew, archive/delete, and the
   per-row `BoardActionsMenu`, via the same shared `handleBoardMutation` handler.

4. **Sidebar crew rows navigate to the crew's own page**, not a dashboard filter.
   `CrewSelector` (`app/components/Sidebar.tsx`) links each crew to
   `/app/crews/:id`; "Unassigned" stays a dashboard filter
   (`/app/dashboard?team=unassigned`). The sidebar's own "All" crew row was
   removed as redundant once crew filtering left the dashboard — "Dashboard" in
   the main nav above already goes to the same unfiltered `/app/dashboard`.

5. **Renamed `/app/teams` → `/app/crews` with no redirects or back-compat shims.**
   Teams/crews had zero external users at rename time, so the mechanical rename
   (routes, files, links, redirect targets) shipped as a clean cut. Internal
   naming is untouched: DB tables, `team_model.ts`, and DTOs still say "team";
   only routes and user-facing copy say "crew."

## Consequences

**Positive:**

- One implementation of "a crew's boards" and "a crew's action items." Future
  polish (e.g. a new bulk action) lands once and both surfaces get it.
- The crew page is now a credible foundation for the billing/authorization role
  ADR-0003 anticipates, rather than a stale afterthought next to the dashboard.
- Sidebar navigation model is simpler: one row per crew, one destination each;
  no page shows the same "current filter" state two different ways.

**Negative / load-bearing:**

- `handleBoardMutation`'s `delete` intent returns `null` (revalidate-in-place)
  rather than the dashboard's old `redirect("/app/dashboard")`, because the
  handler must behave correctly on both pages. Any future caller of this
  handler must not assume a redirect on delete.
- `dashboard.tsx`'s `createBoard` action branch still carries crew/personal-team
  fallback logic that is now largely dead — the dashboard no longer passes a
  real crew id through board creation, since crew-scoped creation lives on the
  crew page. Left as-is (flagged, not cleaned up); a future pass can simplify it
  once confirmed truly unreachable.
- The crew page's action-item rollup has no path back to "see everything I
  completed here" — by design (open-only), but a real gap if a facilitator
  wants a completed-items audit view. Would need a new surface, not a toggle on
  this component.

## Alternatives Considered

1. **Full merge — fold crew detail into the dashboard as a filtered view.**
   Rejected: crews need owner-only sections (rename, delete, membership) that
   don't belong on a page users land on by default; would require permission
   branching throughout the dashboard render.
2. **Full GitLab-style IA — crew page with real nested routes/submenu
   (Boards / Items / Members / Settings as separate URLs).** Rejected for now:
   more routing ceremony than the current data volume justifies. The chosen
   "sections on one page" layout is structured so it can graduate into nested
   routes later without a URL change, since RR7 nesting is cheap to add.
3. **Keep both implementations, just polish the crew page to match.** Rejected:
   doesn't fix the root cause — two implementations of the same query and the
   same UI will drift again the next time either gets a feature.

## References

- Issue thread: dashboard/crew-page architectural drift (this session, 2026-07-23).
- ADR-0003 (teams as billing unit — crews' growing importance), ADR-0006
  (action items as first-class board/team records — the model this rollup reuses).
- `app/server/board_actions.ts`, `app/server/board_model.ts`
  (`listVisibleBoards`), `app/server/action_item_model.ts`
  (`listOpenActionItemsForTeam`), `app/routes/app/crews.$id.tsx`,
  `app/components/Sidebar.tsx`, `app/components/DashboardActionItems.tsx`,
  `app/components/DashboardBoardsTable.tsx`.
