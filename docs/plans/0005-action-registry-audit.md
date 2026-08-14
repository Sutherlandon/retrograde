# Plan: Action Registry — verifying `docs/spec/0001-user-feature-map.md` against the code

**Date:** 2026-08-11 · **Branch:** `agent-substrate` · **Status:** ⚠️ **DRAFT — NOT REVIEWED. Landon flagged this as "gets a lot wrong" on 2026-08-11; refinement discussion pending.** Do not act on this document until that discussion happens.

## Reliability of the claims below

This draft was assembled largely from subagent exploration reports. To make the refinement pass cheap, every substantive claim is tagged:

- **[read]** — verified by directly reading the file in question.
- **[reported]** — came from a subagent's exploration and has *not* been independently confirmed. Treat as a lead, not a fact.

## Context

`docs/spec/0001-user-feature-map.md` lists, from memory, the actions each user tier should be able to take. Two questions were asked of it: does every listed action have a real code path, and what did the list miss?

The purpose is not documentation for its own sake. It is a precondition for two things: gating actions behind membership levels, and building an evaluation layer that yields *evidence* of correctness ahead of a paid launch. See the companion plan, `0006-entitlements-and-agent-eval.md`.

A design position confirmed while planning: **anonymous boards are intentionally free of access control.** An anonymous owner returning later is indistinguishable from any other visitor, so ownership cannot be re-established. This is a decision, not a gap, and any registry or gate must preserve it.

---

## Deliverable

`docs/spec/0002-action-registry.md` — the canonical inventory, one row per action, stably numbered so tests and the tier table can reference IDs (`BRD-014`, `CREW-007`, `API-003`):

`ID | Action | Actor tier | Route / component | Method + intent | Server guard | Test coverage | Status`

Sections mirror the actor hierarchy: `SITE-*`, `BRD-*`, `DASH-*`, `CREW-*`, `ADMIN-*`, `API-*`.

`Status` ∈ **Verified** (code path + test) · **Unverified** (code path, no test) · **Broken** (code path exists but cannot succeed) · **Missing** (in the map, not in code) · **Undocumented** (in code, not in the map).

`docs/spec/0001-user-feature-map.md` stays untouched — it is the human-authored statement of intent, and the registry cross-references it rather than overwriting it.

---

## Finding 1 — four board mutation routes have no access check **[read]**

Verified by direct grep for `requireBoardAccess|getBoardAccess|requireFacilitator` across `app/routes/app/board.*.ts`:

| Route | Guard |
|---|---|
| `board.title.ts` | none — imports only `updateBoardTitleServer` |
| `board.columns.ts` | none — `getOptionalUser` only, for blind-brainstorm scoping |
| `board.notes.ts` | none — `getOptionalUser` per branch; only `intent=vote` 401s |
| `board.timer.ts` | none — imports only `startTimerServer` / `stopTimerServer` |

By contrast `board.poll.ts` calls `requireBoardAccess` **[read]** and `board.action-items.ts` calls `requireFacilitator` **[read]**.

On anonymous boards this is the intended design. The concern is that the same routes serve **crew** boards: reads of a members-only crew board (ADR-0010) are denied via `poll`/`board.tsx`, while writes to title, columns, and notes appear to remain open to anyone holding the board id. **This inference has not been confirmed against a running app** — it follows from the guard table above plus `getBoardAccess`'s logic **[read]**, but the end-to-end behavior was not exercised. Confirming or killing it is the first job of the refinement pass, because if true it means members-only crew boards are enforced on read but not on write, and no entitlement layer can sit on top of routes that check nothing.

Related **[reported]**: `notesLocked` / `boardLocked` are enforced only client-side in `BoardContext.tsx`, with no server counterpart.

## Finding 2 — the claim flow cannot succeed **[read for the route, reported for the cause]**

`app/routes/app/board.claim.ts` **[read]** rejects with "This board already has an owner and cannot be claimed" when `hasOwner || !isAnonymousCreator` — i.e. when the board has an `owner` row in `board_members` **or** a non-null `created_by`.

The reported cause is that `app/routes/site/home.tsx` calls `setBoardOwner()` on every board created through the homepage, setting both fields **[reported — not confirmed]**. If so, no board created through the current UI is claimable.

There is no `board.claim.test.ts` **[read]**, and `ClaimModal.tsx` is untested **[reported]** — which would explain how this went unnoticed. The feature map lists the claim affordance for both User 1 ("See message to log in and claim the board") and User 2 ("Claim an anonymous board"); the message renders, the flow does not.

---

## Finding 3 — what the map missed

All **[reported]** unless noted; each needs confirmation before landing in the registry as `Undocumented`.

**Board.** Reorder notes *within* a column (distinct from moving between columns). Attachment list / delete / link-vs-image with a 5-image cap and client-side compression. The entire **Crew Access / facilitator modal** — grant facilitator by username, revoke, "Open Deck to Everyone" toggle, backed by `board.facilitators.ts` (which does exist and is tested **[read]**). Votes-per-person count and voting scope (board/column/note). Clear-all-votes. Timer ±60 adjust and the timer-end modal. The LED legend. Read-only example/tutorial boards.

**Dashboard.** Move a board to a crew (single + bulk). Bulk delete. Create a board directly into a crew. The `?team=unassigned` filter. The `team` virtual role on crew-visible boards. The 3-second undo window on action-item completion.

**Crew.** **Toggle members-only board access** (`restrict_board_access`) — plausibly the most paid-feeling feature in the product, and absent from the map. Crew-scoped board list and board mutations. Personal-crew asymmetry: cannot rename, delete, or add humans; *can* mint API keys. Delete-crew name confirmation.

**Admin.** Reportedly **two** tiers, not one: site admins from the `SITE_ADMIN_IDS` env var, never creatable or removable in-app, versus **granted admins** in an `admin_users` table, which is what the UI's "add admin" creates. If so, the map's "Create new site admins" does not exist as written.

**A missing actor class entirely.** The agent/API tier — `POST /api/v1/boards`, `GET /api/v1/boards/:id`, `POST .../notes`, `POST .../action-items`, `POST /api/v1/cron/archive-stale` (all five have test files **[read]**). The map has no row for a non-human actor despite ADR-0001 making agents first-class. This is arguably the largest omission and the one most worth discussing tomorrow.

## Finding 4 — map entries that don't hold up

- Claim flow, both entries — **Broken**, per Finding 2.
- "Set user preferences · light or dark mode" — real, but `localStorage`-only via `useTheme.ts`, with no test and no persisted user-preference storage, so it does not follow the user across devices **[reported]**.
- Every User 3 (paid) item — the code exists; **nothing is paid-gated**. Any registered user can create unlimited crews and mint unlimited API keys today **[reported, but consistent with there being no plan/subscription column anywhere]**.
- User 1 "View board" — on a restricted crew board an anonymous visitor is redirected to login rather than shown the board **[reported]**.

---

## Coverage baseline for the `Status` column **[read]**

Route tests exist for all five `api/*` routes, both `admin.*`, `board.action-items`, `board.facilitators`, `board.notes`, `board.settings`, `crews`, `crews.$id`, `dashboard`, plus `site/home` and the three `auth/*`.

No route test at all: **`board.title`, `board.columns`, `board.timer`, `board.attachments`, `board.poll`, `board.claim`**, the `board.tsx` loader, and `board.legacy`.

**[reported]** Within tested routes, `notes` `intent=move`, `intent=reorder`, and `DELETE` are uncovered. Untested components with real behavior: `Board.tsx`, `Column.tsx`, `BoardContext.tsx`, `AttachmentModal`, `AttachmentsList`, `ClaimModal`, `AppLayout`, `useTheme`. Three components are reportedly unreferenced dead code — `BoardSettingsModal.tsx`, `TimerButton.tsx`, `ExportButton.tsx` — and should be marked for deletion rather than documented as features. Note that `BoardSettingsModal.tsx` is in the current working-tree diff, so check that judgment against the in-flight change first.

---

## How to verify before building the registry

1. **The ungated-write claim.** Create a board under a restricted crew, then from a logged-out session: `curl -X PATCH http://localhost:3000/app/board/<id>/title -d 'title=proof'`. If the title changes while `GET /app/board/<id>` redirects to login, Finding 1 holds.
2. **The dead claim flow.** Create a board from the homepage, paste its URL into the dashboard's Claim modal, and look for "This board already has an owner and cannot be claimed."
3. **Everything tagged [reported]** — confirm against the files before it earns a registry row.
4. Read the finished registry against `docs/spec/0001-user-feature-map.md` side by side and confirm every original line resolves to exactly one row with a status.
