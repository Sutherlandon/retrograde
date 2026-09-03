# Action Registry

**Updated:** 2026-09-03 · **Branch:** `agent-substrate`

Every action a user or agent can take in Retrograde, who may take it, what enforces that, and whether a test proves it. This is the canonical inventory — if an action exists in the product, it has a row here.

IDs are stable. Tests and the entitlement layer reference them (`BRD-003`, `API-004`).

---

## The tier model

Three tiers. A tier is what an **account** is entitled to; a board inherits the tier of the crew that holds it.

| Tier               | Who              | Boards live on            | Entitles                                                                                             |
| ------------------ | ---------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| **1 · Anonymous**  | no account       | no crew (`team_id IS NULL`) | Creating and using boards. No controls, no owner, everyone is a facilitator. 30-day TTL (ADR-0005). |
| **2 · Registered** | free account     | the personal crew          | Permanent boards, the dashboard, the facilitator role, API keys for their own agents.                |
| **3 · Paid**       | subscriber       | named crews                | Named multi-member crews, crew action items, and members-only board access.                          |

The tier boundary in code is `teams.is_personal`. A personal crew is tier 2 and cannot be renamed, deleted, given human members, or restricted. A named crew is tier 3 and can do all four.

Tier 1 is enforced by construction, not by convention. A crewless board is created with **no owner row** and `open_facilitation = TRUE`; the open-facilitation toggle is refused on a crewless board; moving a board onto a crew closes facilitation to the role and moving it off reopens it. A one-time gated reset (`db_init.ts` block 32, ADR-0009 pattern) brought pre-existing anonymous boards into line. No path in the code can produce a crewless board with an owner.

### Board access is a separate axis

Being tier 3 does not by itself close a board. **A board is members-only if and only if its crew has `restrict_board_access = true`** — a switch only named crews can flip (CREW-008). It is **on by default** for every named crew and forced off for personal crews (ADR-0010, `db_init.ts` block 31). A tier-3 crew that turns it off has boards as open as a tier-1 board. Throughout this document, "members-only board" means that switch is on; it is not a synonym for tier 3.

Two independent mechanisms enforce all of this, and the distinction matters for every row below:

- **`requireBoardAccess`** (`app/server/board_permissions.ts`) — *may you touch this board at all?* Allows unconditionally unless the board's crew is members-only, in which case it requires crew membership, board membership, or an API key belonging to that crew.
- **`requireFacilitator`** — *may you run the retro?* True for facilitators, and for everyone when `open_facilitation` is on.

Tier 1's openness is deliberate. An anonymous creator returning later is indistinguishable from any other visitor, so ownership cannot be re-established and pretending otherwise would only create a lock nobody holds the key to.

Agents are actors, not a separate tier. An API key is scoped to a crew and carries that crew's tier (ADR-0008).

### The conversion path

The tiers are shaped by one acquisition loop, and the boundaries sit where they do because of it:

1. An agent discovers Retrograde and creates a board with **no authentication** (API-002). The board is crewless, has **no owner**, and holds a 30-day TTL. The agent keeps an `agent_token` for it.
2. The agent shows the board to a human.
3. The human signs up and **claims** it (BRD-020, DASH-016) — becoming its owner. The claim also moves the board into their **personal crew**, which makes it permanent: the 30-day TTL only touches crewless boards (ADR-0012). A personal crew is never members-only, so **the agent keeps working with the same token**. Nothing is handed over, nothing breaks, and the room keeps whatever facilitation it had.
4. The human buys a named crew and moves the board into it. Named crews are members-only by default (ADR-0010), so **now** the agent's anonymous token fails, and it needs a minted key belonging to that crew.

An API key is therefore not what lets an agent participate — it is what lets an agent participate *in a locked room*, plus what lets it create boards that live on the human's dashboard instead of expiring (API-001). That is why the first key is free at tier 2 and why the paywall lands at step 4: the human pays at the moment they ask for control, not at the moment they arrive.

The handoff at step 4 is real friction — the human mints a key and must get it to their agent. That is the cost of the boundary being where it is, and it is the right place to pay it.

### Facilitator is the primitive; owner is a kind of facilitator

**Every control on a board is designed for the facilitator role.** The owner is a facilitator who additionally holds lifecycle rights over the board as an object, and who cannot be demoted. Not the reverse — "owner" is never the reason someone may run a retro.

|                                                                                                         | Facilitator | Owner                |
| ------------------------------------------------------------------------------------------------------- | ----------- | -------------------- |
| Run the retro — timer, locks, settings, columns, attachments, action items, granting other facilitators | ✓           | ✓ (as a facilitator) |
| Board lifecycle — delete, archive, duplicate, move to a crew                                            | —           | ✓                    |
| Can be revoked                                                                                          | ✓           | —                    |

This ordering is what makes all three tiers describable with one primitive. At tier 1 there is no meaningful owner at all, so a model rooted in ownership has nothing to say about an anonymous board; a model rooted in facilitation says "everyone is a facilitator" and the tier falls out.

This is ADR-0006's decision, not a new one: facilitators get "settings, locks, timer, attachments, title, action items, and managing other facilitators," and only board lifecycle and immunity-from-removal stay with the owner.

`userCanFacilitate` gets it right — it resolves `open_facilitation OR role IN ('owner','facilitator')`, folding the owner into the facilitator set. So do `Column.tsx` and `AttachmentsList.tsx`, which gate on `canFacilitate`.

`isOwner` is the correct gate in exactly one place — the dashboard's lifecycle controls (`BoardActionsMenu`, DASH-006 – DASH-012).

## Status vocabulary

| Status         | Meaning                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verified**   | Code path exists, guard is correct for its tier, a test covers it.                                                                                |
| **Unverified** | Code path exists and looks correct; no test proves it.                                                                                            |
| **Gap**        | Code path exists; the server does not enforce what the tier model says it should. The UI may hide the control, but the route accepts the request. |
| **Ungated**    | Code path exists and works; the tier model says it should cost money and nothing charges for it.                                                  |
| **Broken**     | Code path exists and cannot succeed.                                                                                                              |
| **Missing**    | Specified here as intended behavior; no code path exists yet.                                                                                     |

---

## SITE — public pages

| ID       | Action                                 | Who    | Code path                | Guard                       | Status     |
| -------- | -------------------------------------- | ------ | ------------------------ | --------------------------- | ---------- |
| SITE-001 | View homepage                          | Anyone | `routes/site/home.tsx`   | none needed                 | Verified |
| SITE-002 | View about / contact / terms / privacy | Anyone | `routes/site/*.tsx`      | none needed                 | Verified |
| SITE-003 | Create a board from the homepage       | Anyone | `home.tsx` action        | honeypot field only         | Verified   |
| SITE-004 | Healthcheck                            | Anyone | `routes/healthcheck.tsx` | none needed                 | Verified |
| SITE-005 | Sitemap                                | Anyone | `routes/sitemap.ts`      | none needed                 | Verified |
| SITE-006 | Set light / dark / system theme        | Anyone | `hooks/useTheme.ts`      | client-only, `localStorage` | Verified |

Boards created via SITE-003 are tier 1 and crewless, so they are subject to the 30-day TTL (ADR-0005).

## AUTH — identity

| ID       | Action                                                    | Who            | Code path                    | Guard       | Status   |
| -------- | --------------------------------------------------------- | -------------- | ---------------------------- | ----------- | -------- |
| AUTH-001 | Log in via OAuth                                          | Anyone         | `routes/auth/login.ts`       | —           | Verified |
| AUTH-002 | OAuth callback; create/refresh user; ensure personal crew | Anyone         | `routes/auth/callback.ts`    | state param | Verified |
| AUTH-003 | Log out                                                   | Session holder | `routes/auth/logout.ts`      | —           | Verified |
| AUTH-004 | Get an anonymous user record on first board visit         | Anyone         | `components/BoardLayout.tsx` | —           | Verified |

## BRD — board content

Participant-level actions. Open to anyone with the link, unless the board's crew is members-only — then to permitted actors only.

| ID      | Action                                   | Who                | Code path                                               | Guard                                            | Status     |
| ------- | ---------------------------------------- | ------------------ | ------------------------------------------------------- | ------------------------------------------------ | ---------- |
| BRD-001 | View a board                             | Anyone w/ access   | `routes/app/board.tsx`                                  | `requireBoardAccess` (login redirect)            | Verified |
| BRD-002 | Poll a board for updates                 | Anyone w/ access   | `board.poll.ts`                                         | `requireBoardAccess`                             | Verified |
| BRD-003 | Edit board title | Facilitator | `board.title.ts` · `BoardToolbar` | `requireBoardAccess` → `requireFacilitator` → `requireUnlocked(board)` | Verified |
| BRD-004 | Add a note | Anyone w/ access | `board.notes.ts` PATCH | `requireBoardAccess` · `requireUnlocked(notes)` | Verified |
| BRD-005 | Edit a note | Anyone w/ access | `board.notes.ts` PATCH | `requireBoardAccess` · `requireUnlocked(notes)` | Verified |
| BRD-006 | Delete a note | Anyone w/ access | `board.notes.ts` DELETE | `requireBoardAccess` · `requireUnlocked(notes)` | Verified |
| BRD-007 | Move a note between columns | Anyone w/ access | `board.notes.ts` `intent=move` | `requireBoardAccess` · `requireUnlocked(notes)` | Verified |
| BRD-008 | Reorder notes within a column | Anyone w/ access | `board.notes.ts` `intent=reorder` | `requireBoardAccess` · `requireUnlocked(notes)` | Verified |
| BRD-009 | Like a note | Anyone w/ access | `board.notes.ts` `intent=like` | `requireBoardAccess` · `requireUnlocked(board)` | Verified |
| BRD-010 | Vote / unvote a note | Session holder w/ access | `board.notes.ts` `intent=vote` | `requireBoardAccess` · `requireUnlocked(board)` · 401 if no session | Verified |
| BRD-011 | Edit a column title | Anyone w/ access | `board.columns.ts` PATCH · `Column.tsx` | `requireBoardAccess` · `requireUnlocked(notes)` | Verified |
| BRD-012 | Add / edit / delete column prompt text | Facilitator | `board.columns.ts` `intent=updatePrompt` · `Column.tsx` | `requireFacilitator` · `requireUnlocked(board)`; UI gates on `canFacilitate` | Verified |
| BRD-013 | Delete a column | Facilitator | `board.columns.ts` DELETE · `Column.tsx` | `requireFacilitator` · `requireUnlocked(board)`; UI gates on `canFacilitate` | Verified |
| BRD-014 | Check off an action item | Session holder w/ access | `board.action-items.ts` `intent=complete` | session required · `requireUnlocked(board)` | Verified |
| BRD-015 | View action items + progress             | Anyone w/ access   | `ActionItemsPanel` via `BoardDTO`                       | inherits BRD-001                                 | Verified   |
| BRD-016 | View votes remaining / status indicators | Anyone w/ access   | `BoardStatusBar`                                        | inherits BRD-001                                 | Verified   |
| BRD-017 | View read-only example boards            | Anyone             | `board.tsx` (`example-board*`)                          | short-circuits before access check               | Verified |
| BRD-018 | Follow a legacy `/board/:id` link        | Anyone             | `board.legacy.tsx`                                      | redirect only                                    | Verified |
| BRD-019 | List a board's attachments | Anyone w/ access | `board.attachments.ts` loader | `requireBoardAccess` | Verified |
| BRD-020 | Claim an unowned board from the board itself | Registered | `board.claim.ts` · `BoardToolbar` | `requireRegisteredUser`; succeeds only when no owner row exists; assigns the personal crew (ADR-0012) | Verified |

Locks are enforced on the server with exactly the matrix the UI applies (documented above `requireUnlocked` in `board_permissions.ts`): `notesLocked` blocks BRD-004 – BRD-008 and BRD-011; `boardLocked` blocks those plus BRD-009, BRD-010, BRD-012, BRD-013, BRD-014, the timer, adding a column, the title, and action items. Facilitators do not bypass locks. `board.settings.ts` is never lock-gated, because it is how a board unlocks.

BRD-020 is the primary claim affordance: a button on the board itself, shown when the board has no owner. Claiming from the dashboard by pasting a link (DASH-016) is the fallback for someone who already left the board. A board created anonymously or through the API trial flow never has an owner row, so both succeed on it; a board on a crew always has one, so both refuse. Claiming assigns the claimer's personal crew, which makes the board permanent — the 30-day TTL only touches crewless boards. It deliberately leaves `open_facilitation` alone, so claiming a live retro does not take the Command Deck away from the room (ADR-0012).

## DECK — facilitation (the Command Deck)

Facilitators — granted, or the owner in their capacity as one, or everyone when `open_facilitation` is on. At tier 1 that is everyone, by design.

| ID       | Action                                          | Who                | Code path                                             | Guard                                       | Status     |
| -------- | ----------------------------------------------- | ------------------ | ----------------------------------------------------- | ------------------------------------------- | ---------- |
| DECK-001 | Open the Command Deck                           | Facilitator        | `Board.tsx` → `CommandDeck`                           | `canFacilitate` from `getBoardServer`       | Verified   |
| DECK-002 | Start a timer | Facilitator | `board.timer.ts` POST | `requireBoardAccess` → `requireFacilitator` → `requireUnlocked(board)` | Verified |
| DECK-003 | Stop a timer | Facilitator | `board.timer.ts` DELETE | `requireBoardAccess` → `requireFacilitator` → `requireUnlocked(board)` | Verified |
| DECK-004 | Adjust timer ±60s before start                  | Facilitator        | `CommandDeck`                                         | client-side                                 | Verified |
| DECK-005 | See the timer-end modal                         | Anyone w/ access   | `TimerEndModal`                                       | —                                           | Verified |
| DECK-006 | Add a column | Facilitator | `board.columns.ts` POST | `requireFacilitator` · `requireUnlocked(board)` | Verified |
| DECK-007 | Sort notes by score                             | Facilitator        | `CommandDeck` → note reorder                          | inherits BRD-008                            | Verified |
| DECK-008 | Enable / disable voting                         | Facilitator        | `board.settings.ts` PATCH                             | `requireFacilitator`                        | Verified   |
| DECK-009 | Set votes per person                            | Facilitator        | `board.settings.ts` PATCH                             | `requireFacilitator`                        | Verified   |
| DECK-010 | Set voting scope (board / column / note)        | Facilitator        | `board.settings.ts` PATCH                             | `requireFacilitator`                        | Verified   |
| DECK-011 | Clear all votes and likes                       | Facilitator        | `board.settings.ts` POST                              | `requireFacilitator`                        | Verified   |
| DECK-012 | Toggle human attribution                        | Facilitator        | `board.settings.ts` PATCH                             | `requireFacilitator`                        | Verified   |
| DECK-013 | Toggle "Hide Others' Notes"                     | Facilitator        | `board.settings.ts` PATCH                             | `requireFacilitator`                        | Verified   |
| DECK-014 | Show / hide the action-items column             | Facilitator        | `board.settings.ts` PATCH                             | `requireFacilitator`                        | Verified   |
| DECK-015 | Lock notes                                      | Facilitator        | `board.settings.ts` PATCH                             | `requireFacilitator` (setting only)         | Verified   |
| DECK-016 | Lock the board                                  | Facilitator        | `board.settings.ts` PATCH                             | `requireFacilitator` (setting only)         | Verified   |
| DECK-017 | Attach a link | Facilitator | `board.attachments.ts` POST | `requireFacilitator` | Verified |
| DECK-018 | Attach an image (max 5, compressed client-side) | Facilitator | `board.attachments.ts` POST | `requireFacilitator` | Verified |
| DECK-019 | Delete an attachment | Facilitator | `board.attachments.ts` DELETE · `AttachmentsList.tsx` | `requireFacilitator`; UI gates on `canFacilitate` | Verified |
| DECK-020 | Grant a facilitator by username                 | Facilitator        | `board.facilitators.ts` POST                          | `requireFacilitator`                        | Verified   |
| DECK-021 | Revoke a facilitator (never the owner)          | Facilitator        | `board.facilitators.ts` DELETE                        | `requireFacilitator`                        | Verified   |
| DECK-022 | Toggle open facilitation | Facilitator | `board.facilitators.ts` PATCH | `requireFacilitator`; refused on a crewless board, which is always open | Verified |
| DECK-023 | Create an action item | Facilitator | `board.action-items.ts` POST | `requireFacilitator` · `requireUnlocked(board)` | Verified |
| DECK-024 | Edit an action item | Facilitator | `board.action-items.ts` `intent=text` | `requireFacilitator` · `requireUnlocked(board)` | Verified |
| DECK-025 | Delete an action item | Facilitator | `board.action-items.ts` DELETE | `requireFacilitator` · `requireUnlocked(board)` | Verified |
| DECK-026 | Export board as CSV                             | Facilitator        | `CommandDeck` → `utils/exportBoard`                   | client-side                                 | Verified   |
| DECK-027 | Export board as Markdown                        | Facilitator        | `CommandDeck` → `utils/exportBoard`                   | client-side                                 | Verified   |
| DECK-028 | View note / contributor / voter counts          | Facilitator        | `CommandDeck`                                         | client-side                                 | Verified   |
| DECK-029 | Collapse / expand the deck                      | Facilitator        | `CommandDeck`                                         | client-side                                 | Verified   |

Note: When an owner duplicates the board, facilitator grants are copied.  When a non-owner dupliates the board, facilitator grants are **not** copied.

## DASH — dashboard

Registered users only; `AppLayout` requires a registered session, and every action re-checks.

| ID       | Action                                             | Who                       | Code path                       | Guard                                        | Status               |
| -------- | -------------------------------------------------- | ------------------------- | ------------------------------- | -------------------------------------------- | -------------------- |
| DASH-001 | View the dashboard                                 | Registered                | `dashboard.tsx` loader          | `requireRegisteredUser`                      | Verified             |
| DASH-002 | See own boards + crew-visible boards               | Registered                | `listVisibleBoards`             | SQL scoping                                  | Verified             |
| DASH-003 | Create a board (into selected crew, else personal) | Registered                | `dashboard.tsx` action          | `requireRegisteredUser` + `userIsTeamMember` | Verified             |
| DASH-004 | Filter boards by fuzzy text                        | Registered                | `dashboard.tsx`                 | client-side                                  | Verified |
| DASH-005 | Sort by updated / created / title, persisted       | Registered                | `SortBoardsBanner`              | client-side                                  | Verified             |
| DASH-006 | Duplicate a board | Board owner | `board_actions.ts` `duplicate` | role check in model; the copy lands on the original's crew if the caller is a member, else their personal crew — never crewless | Verified |
| DASH-007 | Delete a board                                     | Board owner               | `board_actions.ts` `delete`     | role check in model                          | Verified             |
| DASH-008 | Archive a board                                    | Board owner               | `board_actions.ts` `archive`    | role check in model                          | Verified             |
| DASH-009 | Unarchive a board                                  | Board owner               | `board_actions.ts` `unarchive`  | role check in model                          | Verified             |
| DASH-010 | Move a board to a crew                             | Board owner + crew member | `board_actions.ts` `moveBoard`  | SQL `EXISTS` owner + membership              | Verified             |
| DASH-011 | Bulk-move boards                                   | Board owner + crew member | `board_actions.ts` `bulkMove`   | SQL `EXISTS`                                 | Verified             |
| DASH-012 | Bulk-delete boards                                 | Board owner               | `board_actions.ts` `bulkDelete` | SQL join on `board_members`                  | Verified             |
| DASH-013 | Filter to unassigned boards (`?team=unassigned`)   | Registered                | `dashboard.tsx` · `Sidebar`     | scoped to caller                             | Verified             |
| DASH-014 | View archived boards                               | Registered                | `dashboard.tsx`                 | scoped to caller                             | Verified             |
| DASH-015 | View open action items across own boards           | Registered                | `listOpenActionItemsForUser`    | scoped to caller                             | Verified             |
| DASH-016 | Claim an unowned board by pasting its link | Registered | `board.claim.ts` · `ClaimModal` | `requireRegisteredUser`; succeeds only when no owner row exists; assigns the personal crew (ADR-0012) | Verified |
| DASH-017 | Dismiss the welcome banner                         | Registered                | `WelcomeBanner`                 | client-side                                  | Verified |

## CREW — crews

Everyone gets a personal crew at signup (tier 2). **Creating a named crew is the paid line (tier 3)**, and everything a named crew unlocks — human members, renaming, deletion, members-only access — sits behind it.

| ID       | Action                                    | Tier | Who         | Code path                           | Guard                                | Status      |
| -------- | ----------------------------------------- | ---- | ----------- | ----------------------------------- | ------------------------------------ | ----------- |
| CREW-001 | List own crews                            | 2    | Registered  | `crews.tsx` loader                  | `requireRegisteredUser`              | Verified    |
| CREW-002 | **Create a named crew** | 3 | Paid | `crews.tsx` action | `accountCanCreateNamedCrew` seam → 403; returns true until a billing provider exists | **Ungated** |
| CREW-003 | View a crew page                          | 2    | Crew member | `crews.$id.tsx` loader              | `requireRegisteredUser` + `teamRole` | Verified    |
| CREW-004 | Rename a crew                             | 3    | Crew owner  | `crews.$id.tsx` `rename`            | owner + `!is_personal`               | Verified    |
| CREW-005 | Delete a crew                             | 3    | Crew owner  | `crews.$id.tsx` `deleteTeam`        | owner + `!is_personal`               | Verified    |
| CREW-006 | Add a member by username                  | 3    | Crew owner  | `crews.$id.tsx` `addMember`         | owner + `!is_personal`               | Verified    |
| CREW-007 | Remove a member                           | 3    | Crew owner  | `crews.$id.tsx` `removeMember`      | owner                                | Verified    |
| CREW-008 | **Toggle members-only board access**      | 3    | Crew owner  | `crews.$id.tsx` `setRestrictAccess` | owner + `!is_personal`               | Verified    |
| CREW-009 | Mint the **first** API key (one AI crewmate) | 2 | Crew owner  | `crews.$id.tsx` `mintKey`           | owner (personal crews allowed)       | Verified    |
| CREW-019 | Mint **additional** API keys | 3 | Crew owner | `crews.$id.tsx` `mintKey` | `mintApiKey` refuses a second active key on a personal crew | Verified |
| CREW-010 | List API keys                             | 2    | Crew member | `crews.$id.tsx` loader              | membership                           | Verified    |
| CREW-011 | Revoke an API key                         | 2    | Crew owner  | `crews.$id.tsx` `revokeKey`         | owner                                | Verified    |
| CREW-012 | Create a board into the crew              | 2    | Crew member | `crews.$id.tsx` `createBoard`       | membership                           | Verified    |
| CREW-013 | View crew boards                          | 2    | Crew member | `listVisibleBoards`                 | membership                           | Verified    |
| CREW-014 | Add a crew action item                    | 3    | Crew member | `crews.$id.tsx` `addItem`           | membership                           | Verified    |
| CREW-015 | Toggle a crew action item                 | 3    | Crew member | `crews.$id.tsx` `toggleItem`        | membership                           | Verified    |
| CREW-016 | Edit a crew action item                   | 3    | Crew member | `crews.$id.tsx` `updateItem`        | membership                           | Verified    |
| CREW-017 | Delete a crew action item                 | 3    | Crew member | `crews.$id.tsx` `deleteItem`        | membership                           | Verified    |
| CREW-018 | See open items rolled up from crew boards | 3    | Crew member | `crews.$id.tsx` loader              | membership                           | Verified    |

Tier-2 rows describe the personal crew: every registered user gets one, it holds their boards, and it can mint **one** API key, since that is how a solo user brings an agent in. Tier-3 rows require a named crew, and CREW-002 is the only thing standing between a free user and one.

**One key free, additional keys paid**, applying ADR-0008's "API keys are AI crew members" consistently: a crew of one — you plus your agent — is tier 2, and a second member is tier 3 whether that member is human or AI. The cap is enforced in `mintApiKey`, so the API cannot bypass it.

Note what the cap does and does not do. It limits *fleet size*, not *volume* — a single free key can drive unlimited writes, and API-002 needs no key at all. Metering agent activity is a separate lever and neither exists today.

CREW-002 is therefore the single gate that has to hold for any of this to be sellable, and it does not exist — see GAP-005. CREW-014 – CREW-018 are marked tier 3 because a personal crew is single-member; the code does not block crew action items on a personal crew, it is simply a list of one.

## ADMIN

Two distinct admin kinds. Site admins come from the `SITE_ADMIN_IDS` env var and cannot be created or removed in the app. Granted admins live in `admin_users` and are what the UI manages.

| ID        | Action                   | Who                   | Code path             | Guard                       | Status   |
| --------- | ------------------------ | --------------------- | --------------------- | --------------------------- | -------- |
| ADMIN-001 | View the admin dashboard | Site or granted admin | `admin.dashboard.tsx` | env list + `isGrantedAdmin` | Verified |
| ADMIN-002 | View metrics             | Site or granted admin | `metrics_model.ts`    | inherits ADMIN-001          | Verified |
| ADMIN-003 | List granted admins      | Site admin            | `admin.admins.ts`     | `requireSiteAdmin`          | Verified |
| ADMIN-004 | Grant admin to a user    | Site admin            | `admin.admins.ts`     | `requireSiteAdmin`          | Verified |
| ADMIN-005 | Revoke a granted admin   | Site admin            | `admin.admins.ts`     | `requireSiteAdmin`          | Verified |

## API — agents

Authenticated by `Authorization: Bearer rk_live_*` (crew-scoped key) or, for legacy trial boards, the session-cookie `agent_token`.

| ID      | Action                                                                   | Who                      | Code path                        | Guard                  | Status   |
| ------- | ------------------------------------------------------------------------ | ------------------------ | -------------------------------- | ---------------------- | -------- |
| API-001 | Create a board with columns (authenticated → caller's crew; a registered cookie caller with no crew gets their personal crew) | API key or session | `api/boards.ts` POST | `getApiUser` | Verified |
| API-002 | Create a trial board (unauthenticated → crewless, no owner, open facilitation; returns `agent_token`) | Anyone | `api/boards.ts` POST | none, by design | Verified |
| API-003 | Read a board as JSON                                                     | Anyone w/ access         | `api/board.ts` GET               | `getBoardAccess` → 403 | Verified |
| API-004 | Bulk-add notes (≤200, ≤2000 chars) | Any actor w/ access | `api/board.notes.ts` POST | `getApiUser` · `getBoardAccess` → 403 | Verified |
| API-005 | Bulk-add action items (≤100) | Facilitator | `api/board.action-items.ts` POST | `getBoardAccess` · `userCanFacilitate` | Verified |
| API-006 | Auto-archive stale trial boards                                          | Cron                     | `api/cron.archive-stale.ts`      | `CRON_SECRET` bearer   | Verified |

Agent-authored notes always carry attribution, regardless of the board's attribution setting (ADR-0002).

---

## Gaps

Where the code diverges from the model above. Each is a fact confirmed by reading the source on 2026-09-02, not an inference.

| ID          | Gap                                                                                    | Affects                                                 | Consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GAP-005** | Nothing is payment-gated | CREW-002, and via it every tier-3 row | `crews.tsx` routes through `accountCanCreateNamedCrew` — the single seam — but it returns true for everyone until a billing provider exists, so any free account creates unlimited named crews, adds unlimited members, and turns on members-only access. API keys are capped at one per personal crew. There is no plan or subscription concept in the schema. When billing lands, the seam's body is the whole integration. |

GAP-005 is the only open gap: the paywall itself, which needs a billing provider before it can close. The seam it will use already exists.


## Untested paths

Every row in this document is **Verified** except CREW-002, which is **Ungated** — its seam is tested, and nothing charges. Components with no dedicated test of their own: `Board`, `AttachmentModal`, `ClaimModal`, `AppLayout`, `ThemeToggle`; `board.poll.ts` is covered only through the permission matrix.

Every row marked **Verified** is named by at least one test, and `app/server/registry_linkage.test.ts` fails if that stops being true — or if a test names a row this file still marks Unverified. `app/server/permission_matrix.test.ts` asserts every server-enforced row × every actor × every board tier resolves to an explicit allow or deny; a missing cell is a failing test.
