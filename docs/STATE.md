# Retrograde — Project State

**Last updated:** 2026-05-23 · **Version:** 1.6.1 · **Branch:** `main` is shipping; current work on `fix/oauth-redirect-production-only-vercel-env` (merged as PR #99)

This is the "where are we right now" snapshot. Read this first when picking the project back up. For where it's *going*, see `docs/ROADMAP.md` (TODO). For *why* the load-bearing decisions were made, see [`docs/adr/`](adr/README.md).

---

## Quick Pulse

| | |
|---|---|
| Stack | React 19, React Router 7 (SSR), Tailwind 4, PostgreSQL via raw `pg` |
| Hosting | Vercel (web) + Neon (Postgres) |
| Auth | OAuth 2.0 — Keycloak in Docker for local, external IDP in prod |
| Tests | 173 passing across 23 files (Vitest + RTL, jsdom, mocked `pg`) |
| Real-time | Polling, no WebSockets |
| Schema migrations | All idempotent DDL in `app/server/db_init.ts` (no migration tool) — currently 17 numbered migration blocks |

---

## What's Shipped

Live in production today, organized by domain:

### Boards & Notes (the core retro experience)
- Kanban boards: columns + sticky notes, drag-and-drop reordering (within and across columns) via `@dnd-kit`
- Note likes (heart count) + per-user like tracking
- Column prompt text (helper text shown to participants per column)
- Board title editing (owner only)
- Board archive (soft archive, `archived_at`)
- Board duplication and delete (BoardActionsMenu)
- Export board to CSV or Markdown (ExportButton)
- Legacy `/board/:id` redirect route for backward compat with old links

### Facilitator Tools — the "Command Deck"
- Floating draggable control pod (`CommandDeck.tsx`) — the whimsical "Plan 2" from `facilitator-view.md` shipped (#81)
- **Access is owner-only today.** The owner is the de facto "facilitator" because they're the only one who can open the Command Deck. The distinct *Facilitator Role* (owner delegating Command Deck access to another user, or opening it to everyone) is not yet built — see issue #97.
- Status LEDs for timer/voting/lock states
- Server-synced timer with end-modal notification
- Note lock (participants can't add/edit) and full board lock
- Attachments (file links + image uploads)
- Voting system: enable/disable, votes-per-person, **multi-vote** per note, **voting scopes** (board / column / note) — #98 added scopes & multi-vote UI

### Auth & Identity
- OAuth login/callback/logout (`app/routes/auth/`)
- Anonymous user records for Tier 1 board access (#86) — guests get a real user row, flagged `is_anonymous`
- Session via signed cookie (`session.server.ts`)
- VERCEL_URL redirect now gated to preview env only (#99 — the just-merged fix)
- **Agent identity** (added 2026-06-06): `users.is_agent` + `users.display_name`. Agents authenticate via `Authorization: Bearer <agent_token>` where the token is the session cookie value. See `app/hooks/useAuth.ts:getApiUser` and `createAgentUser`.

### Agent-facing JSON API (new, 2026-06-06)
- `POST /api/v1/boards` — create a board with custom columns; mints an anonymous agent user; returns `{board_id, board_url, agent_token}`.
- `POST /api/v1/boards/:id/notes` — bulk add notes (max 200/request, max 2000 chars/note). Atomic.
- `GET /api/v1/boards/:id` — public JSON read of `BoardDTO`; includes per-note `author` only when attribution is enabled.
- Discoverability: `/llms.txt` and `docs/AI_AGENT_API.md` describe the surface.
- **Out of scope (for now):** MCP server, account-level API keys, agent-name verification, rate limiting, JSON update/delete.

### Teams, Facilitators, Action Items (new, 2026-07-07 — issues #72, #97, #88)
- **Multi-member teams:** `/app/teams` (list + create) and `/app/teams/:id` (crew roster, add member by username, mission boards, team objectives). Team members see all team boards on the dashboard (role shown as `team`). Owner-only: rename/delete team (non-personal), member management. AccountHub → Teams link.
- **Facilitator role (ADR-0006):** `board_members.role='facilitator'` + `boards.open_facilitation`. `canFacilitate` computed in `getBoardServer`, enforced via `app/server/board_permissions.ts`. Command Deck now gates on `canFacilitate`; its "Crew Access" modal grants/revokes facilitators by username and toggles open facilitation. Duplication does NOT copy grants. Settings + attachments routes accept facilitators.
- **Action items (ADR-0006):** `action_items` table (board_id XOR team_id). "Mission Objectives" panel on the board (progress track, checkbox toggles for any session user, facilitator-only create/edit/delete, poll-synced via `BoardDTO.actionItems`). Team-level objectives + open-board-item rollup on the team page. Dashboard shows open counts per board.
- **API parity:** `POST /api/v1/boards/:id/action-items` (bulk, ≤100/request); `GET /api/v1/boards/:id` includes `actionItems`, `canFacilitate`, `openFacilitation`.
- **Dashboard:** create-board now attaches the personal team; Team + Objectives columns added; fixed a pre-existing bug where Created/Updated cells were swapped.
- Schema blocks 26–27 in `db_init.ts`.

### Teams + API Keys + free-tier ephemerality (new, 2026-06-22)
- Every registered user has a personal team auto-created on OAuth callback; one-time backfill in `db_init.ts` covers pre-existing users.
- Boards belong to teams via `boards.team_id` (nullable: anonymous-flow boards stay teamless = the trial pool).
- API keys: `rk_live_<24-char-base64url>`, hashed (SHA-256) at rest, team-scoped, per-key agent identity, revocable. Minted at `/app/account/api-keys`. See ADR-0004.
- `getApiUser` in `app/hooks/useAuth.ts` accepts either a real API key (`rk_live_*`) or the legacy bearer-as-session-cookie token for backward compat with the original agent_token flow.
- `POST /api/v1/boards` branches: authenticated (API key or cookie) → board belongs to caller's team; unauthenticated → trial flow (anonymous agent + agent_token, teamless board).
- Auto-archive cron at `POST /api/v1/cron/archive-stale`, guarded by `CRON_SECRET`, configured in `vercel.json` daily at 03:00 UTC. Archives teamless boards older than 30 days created after the grandfather cutoff (2026-06-22). Boards on a team are never auto-archived; pre-cutoff boards never auto-archive.
- ADRs: [0003](adr/0003-teams-as-billing-unit.md) (teams), [0004](adr/0004-api-keys-for-agent-auth.md) (API keys), [0005](adr/0005-free-tier-ephemerality.md) (TTL).
- **Out of scope (deferred):** billing/Stripe integration, multi-member teams (#72 UI), per-key scopes, account-level (non-team) API keys, claim-flow to convert a trial board to a team board.

### Attribution toggle (new, 2026-06-10)
- `boards.attribution_enabled` (default FALSE) — board-level setting controlling whether **human** note authorship is visible.
- Owner-only toggle in the Command Deck (replaced the "Show Prompts" toggle; prompts now always render when set).
- Gated at the SQL layer in `getBoardServer`: when off, human-authored notes get `author: null`. The API contract honors anonymity, not just the UI.
- Default OFF — anonymity is the social contract of a retro. Owners opt in.
- **Agent authorship is always surfaced** — `OR u.is_agent` in the SQL CASE means agent-authored notes carry full `author` data regardless of `attribution_enabled`. AI transparency is a product guarantee, not configurable. See the comment in `board_model.ts:getBoardServer`.

### Admin
- Admin metrics dashboard with two-tier access (#93)
- Dynamic admin grants via `admin_users` table (#94, #95)
- AccountHub link to admin dashboard for site + granted admins (#98)

### Site & Polish
- Public marketing pages: home, about, contact, terms, privacy
- Welcome banner (dismissable) on dashboard
- Sort persistence, fuzzy filter, clipboard paste, command deck defaults (#91)
- Light/dark/system theme with ThemeInitializer to avoid flash
- Honeypot field on free-board creation (silent redirect for bots) is the only bot defense. Cloudflare Turnstile was **removed entirely** on 2026-05-24 to support the AI-native goal (issue #87) — an agent should be able to create a board without solving a captcha. If bots become a problem, the replacement is rate limiting, not a captcha.
- Healthcheck route + sitemap
- Graceful polling errors with offline banner + auto-reconnect

---

## Recently Merged (last sprint's worth)

In reverse chronological order — gives a feel for current velocity & focus:

- **#99** Gate VERCEL_URL OAuth redirect on preview env only (just merged)
- **#98** Voting scopes + multi-vote UI + admin dashboard link
- **#95 / #94** Admin dashboard link in AccountHub
- **#93** Admin metrics dashboard (two-tier access)
- **#92** CLAUDE.md for AI assistants
- **#91** Usability batch: page titles, sort persistence, fuzzy filter, archive, clipboard paste, command deck defaults
- **#86** Anonymous user records for Tier 1 access
- **#81** Facilitator Command Deck + sort by likes/votes
- **#79** Board locking
- **#78** Board attachments

Pattern: feature work has been broad and consistent. No big stalled refactor in the queue.

---

## Open Issues — Vision Signals

Open GitHub issues, ranked roughly by ambition. These are the things on the user's mind but not yet built. (Full detail belongs in `docs/ROADMAP.md` — this is just the index.)

**Big bets**
- **#87 AI Native** — endpoints/identifiers for AI agents, possible MCP server, rate limiting as the captcha replacement. (Cloudflare Turnstile removal already done — see above.)
- **#72 Teams** — team grouping for facilitators with multiple teams; team-level action items
- **#59 Paywall** — pick a payment platform, gate features behind subscription

**Feature additions**
- **#97 Facilitator Role** — let an owner delegate Command Deck access to a specific user (per-board), or open it to everyone. Today "facilitator" and "owner" collapse to the same person; this issue is what separates them.
- **#88 Actionable Action Items** — dedicated section with checkboxes; surfaces on dashboard
- **#100 Hide tickets** — notes hidden from others until facilitator reveals (classic retro pattern)
- **#38 QR code share** for boards
- **#4 Reorder columns**

**Ops & polish**
- **#89 New Homepage** — "cute, but needs more SEO"
- **#82 Logging** — no structured logging today
- **#10 README** — currently 11 lines

---

## Known Rough Edges

Things that are working but won't scale or will bite us later:

1. **`docs/facilitator-view.md` is stale.** Plan 2 ("The Command Deck") shipped in #81. The doc still reads as future work. Either delete it or move to `docs/archive/`.
2. **README is 11 lines** (issue #10). Architecture/services only. No setup, no contribution guide, no screenshots.
3. **No structured logging** (issue #82). `console.log` only. Hard to debug production issues.
4. **Migrations live in `db_init.ts`** — works today, intentional per CLAUDE.md, but if a destructive change is ever needed it has no rollback story. Worth revisiting if/when the user count grows.
5. **Many stale local branches** (~30+) — most correspond to merged PRs. Local cleanup would make `git branch` actually useful.
6. **Test coverage gaps:** core UI like `Note.tsx`, `Board.tsx`, `Column.tsx`, `BoardToolbar.tsx`, `BoardSettingsModal.tsx`, `AttachmentModal.tsx` have no `*.test.tsx`. Models and routes are well-covered; component layer is patchy.
7. **No CI visible from repo root** (no `.github/workflows/` checked in the surface scan — verify before relying on this).
8. **Feature flags scaffolded but unused** (`app/features.ts` — empty arrays). System exists, no flags defined.
9. **`npm run typecheck` reports pre-existing errors** in `home.test.ts`, `board.settings.test.ts`, and `dashboard.test.ts` — the React Router 7 `ActionFunctionArgs` type now requires `unstable_pattern`, which the test fixtures don't pass. Tests still run green via Vitest. Fix by updating the test fixture helpers, or by typing the cast at the call site.

---

## Operational Reality

- **Solo developer** (Landon) with AI-assisted commits (multiple `claude/*` branches in history).
- **Deployed on Vercel**, DB on Neon — both serverless-y, low ops burden.
- **No staging environment visible** from config — preview deploys via Vercel handle this.
- **Schema initialized on every startup** (`initializeDatabase()` is called at the bottom of `db_init.ts`). Idempotent, but means startup briefly touches the DB even in read-only paths.
- **Dev data seed** lives at the bottom of `db_init.ts` (`dev-test` board) — runs in prod too, which is harmless but noisy.
