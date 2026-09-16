# CLAUDE.md — Retrograde

This file describes the codebase structure, development workflows, and conventions for AI assistants working in this repository.

---

## Engineering Rules

These rules apply to all work in this repository.

### 1. Test-Driven Development

Write tests before writing implementation code. Every feature must have tests that verify it works. Tests protect against regressions during refactoring.

- Add a `*.test.ts` / `*.test.tsx` file alongside every new module, route, or component.
- Tests must pass before a change is considered complete.
- When fixing a bug, write a failing test that reproduces it first.

### 2. Function Size

Keep functions under **150 lines**. If a function grows beyond that, break it into smaller, well-named pieces. Smaller functions are easier to read, test, and debug.

### 3. Language Preference

**TypeScript is the default.** Python is acceptable as an alternative. Any other language requires strong justification — only warranted for performance-critical work or hard architectural constraints.

### 4. Modular Plugin Architecture

Organize code by **feature/domain**, not by type. Each domain owns all of its related logic together:

```
app/server/      # e.g. board_model.ts owns all board SQL
app/routes/app/  # e.g. board.notes.ts owns note mutations
app/context/     # e.g. BoardContext.tsx owns board client state
```

Wire domains together with minimal integration points at the top level. Avoid cross-domain imports except through well-defined interfaces.

### 5. Centralized Configuration

All environment variables must be **defined, validated, and loaded in one place at startup** (`app/server/db_config.ts`). If a required variable is missing, the app must fail loudly at startup with a clear error — not silently at runtime.

Anything that varies by deployment — hosted or self-hosted, logout visibility, the OIDC username claim, branding — is an environment variable, never a source edit a customer has to carry through upgrades (ADR-0017). Values the browser needs reach it as props from the layout loaders; `process.env` does not exist on the client.

Never scatter `process.env` references throughout the codebase. Import config values from the config modules.

### 6. Decision Logs

`docs/` records **where the project is** and **why it is that way**. It does not record how it got there — git has the history, and a narrative archive quietly contradicts the docs that are current.

Before starting a significant feature or refactor, write a plan. When it lands, fold anything durable into the records below and delete the plan.

**Four kinds of record:**

- **`docs/STATE.md`** — the "what's where right now" snapshot: current pulse, known gaps, gotchas. Edit freely.
- **`docs/spec/0001-action-registry.md`** — every action in the product, who may take it, what enforces that, and whether a test proves it. Update it whenever you add, remove, or re-gate an action.
- **`docs/plans/`** — one unfinished feature or refactor. Disposable: deleted when the work merges. See `docs/plans/README.md`.
- **`docs/adr/`** — Architecture Decision Records. Long-memory documents capturing decisions that shape the architecture or product direction. Use ADRs when a decision is hard to reverse, shapes future work, has non-obvious rejected alternatives, or might otherwise be challenged without context. Read `docs/adr/README.md` for the convention. **Never edit an accepted ADR's substance** — supersede it with a new ADR that references the old one.

### 7. Keep Secrets Secret

Never hardcode secrets, credentials, or API keys in source-controlled files. Always use environment variables. See the [Environment Variables](#environment-variables) section for the full list. Never commit `.env` files.

---

## Project Overview

**Retrograde** is a full-stack TypeScript/React SSR web app for facilitating retrospective meetings. Teams use it to create collaborative kanban-style boards with sticky notes, voting, timers, drag-and-drop, and OAuth authentication.

**Stack:** React 19, React Router 7, Tailwind CSS 4, PostgreSQL, Vite, Vitest  
**Architecture:** Server-side rendered (SSR) with real-time polling for board updates (no WebSockets)

---

## Repository Structure

```
app/
├── routes/
│   ├── app/          # Authenticated routes (dashboard, board operations)
│   ├── auth/         # OAuth login/logout/callback flows
│   └── site/         # Public pages (home, about, contact, terms, privacy)
├── components/       # React UI components (36+ .tsx files)
├── context/          # React context providers (BoardContext, userContext)
├── hooks/            # Custom React hooks (useAuth, useTheme)
├── server/           # Backend server code & PostgreSQL models
├── utils/            # Helper functions (exportBoard CSV/Markdown)
├── config/           # Product constants (grandfather.ts); deployment config is env, read in server/db_config.ts
├── images/           # SVG icon components
├── example-data/     # Sample boards for onboarding/tutorials
├── root.tsx          # Root layout & error boundary
├── routes.ts         # Route configuration
├── session.server.ts # Session cookie management
└── features.ts       # Feature flags
public/               # Static assets (icons, PDFs)
docs/                 # Decision log, project state, feature planning
```

---

## Development Commands

```bash
npm run dev         # Start dev server with HMR (React Router dev mode)
npm run build       # Production build → /build directory
npm start           # Serve production build
npm test            # Run all tests once (Vitest)
npm run typecheck   # Generate React Router types + TypeScript check
```

Always run `npm run typecheck` after making changes to catch type errors before committing.

---

## Environment Variables

Copy these into a `.env` file (never commit `.env`):

```bash
# OAuth (required)
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
OAUTH_AUTHORIZATION_URL=
OAUTH_TOKEN_URL=
OAUTH_USERINFO_URL=
OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback
OAUTH_SCOPES=openid profile email
# Optional — where logout sends the browser: an http(s) URL (e.g. the IdP's
# end-session endpoint) or a path. Default "/".
OAUTH_LOGOUT_REDIRECT_URL=

# Session (required)
SESSION_SECRET=

# Database (required) — DATABASE_URL, OR all four PG_* vars (not both). The
# connection uses TLS with the server certificate verified whenever NODE_ENV is
# not development; sslmode=disable / ssl=false in the URL are refused there
# (ADR-0018). A private CA goes in the URL as sslrootcert=/path/to/ca.pem.
DATABASE_URL=
PG_HOST=
PG_USER=
PG_PASSWORD=
PG_SCHEMA=

# Cron (required) — bearer secret for /api/v1/cron/archive-stale. Vercel's
# scheduler sends it automatically as an Authorization header, and invokes the
# path with GET.
CRON_SECRET=

# Deployment mode (optional) — ADR-0016, ADR-0017. Unset or "false" is the
# hosted service. "true" is a self-hosted instance: every account is tier 3,
# billing does not exist, the dashboard is home with no marketing site, and
# the Stripe variables below must NOT be set. Any other value refuses to boot.
SELF_HOSTED=

# Hosting presentation (optional) — ADR-0017. Configured here so a deployment
# never edits code. HIDE_LOGOUT=true hides logout, for SSO that signs users
# straight back in. OAUTH_USERNAME_FIELD is the stored profile field shown as
# the username: preferred_username (default), email, name, given_name or
# family_name. A site logo needs all three SITE_LOGO_* values or none; the
# URLs must be reachable from users' browsers.
HIDE_LOGOUT=
OAUTH_USERNAME_FIELD=
SITE_LOGO_LIGHT_URL=
SITE_LOGO_DARK_URL=
SITE_LOGO_ALT=

# Stripe (required on the hosted service; refused when SELF_HOSTED=true) —
# ADR-0013. A RESTRICTED key (rk_…), never the account secret key; the webhook
# signing secret; the id of the single monthly Price.
STRIPE_RESTRICTED_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

# Admin (required) — comma-separated OAuth sub values (users.external_id) of
# the site admins. At least one.
SITE_ADMIN_IDS=

# Server (optional) — PORT is read by react-router-serve; validated as 1–65535.
PORT=
```

Every variable marked required is read through `requireEnv()` in `app/server/db_config.ts`, which exits the process with a clear message if it is missing — in every environment, including local dev. `npm run dev` will not boot without all of them. The Stripe variables are the one mode-dependent set: required unless `SELF_HOSTED=true`, and refused when it is (ADR-0016). Optional variables are validated the same way: a malformed value exits at startup. Nothing warns and carries on (ADR-0018).

`NODE_ENV` must be `development`, `production` or `test`. Anything but `development` requires TLS to the database with the certificate verified, so `npm start` against a local Postgres without TLS will not connect — use `npm run dev` locally. `production`, the default under `npm start`, also marks the session cookie `Secure`, so production needs HTTPS.

Self-hosting is documented for operators in [`README.md`](README.md).

---

## Database

- **PostgreSQL** via raw `pg` client — no ORM.
- Tables: `boards`, `columns`, `notes`, `users`, `board_members`, `note_votes`, `note_likes`, `board_attachments`.
- **Schema management:** `app/server/db_init.ts` runs idempotent `CREATE TABLE IF NOT EXISTS` on startup — no migration tool.
- Queries use positional binding (`$1`, `$2`, …) and `json_build_object` for nested JSON responses.
- Permission checks live in SQL via `EXISTS` sub-clauses (not application-layer guards).

When adding a new table or column, add it to `db_init.ts` using `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so it is safe to run repeatedly.

---

## Architecture Patterns

### Route / Action Structure

React Router 7 resource routes handle all mutations. Route files export:
- `loader` — fetches data for GET requests
- `action` — handles POST/PUT/DELETE mutations

**Resource routes** (no UI, pure mutation handlers) live under `app/routes/app/` and are named by domain:
```
board.notes.ts       # CRUD for notes
board.columns.ts     # CRUD for columns
board.settings.ts    # Board settings mutations
board.timer.ts       # Timer control
board.attachments.ts # Attachment upload/delete
```

### State Management (BoardContext)

`app/context/BoardContext.tsx` is the central state hub for active boards.

Key pattern: **separate fetchers per concern** — do not use a single dispatcher bus.

```ts
const columnFetcher  = useFetcher();
const noteFetcher    = useFetcher();
const timerFetcher   = useFetcher();
const settingsFetcher = useFetcher();
```

State is derived from server data; client-side overrides (e.g., drag-and-drop reordering) are ephemeral and do not block the server round-trip.

### Layered Type System (`app/server/board.types.ts`)

Types follow a strict 4-layer pattern — do not collapse these layers:

| Layer | Name | Description |
|-------|------|-------------|
| 1 | **Server DTOs** | Exact shape of a DB row |
| 2 | **Client State** | DTO + ephemeral client fields |
| 3 | **Actions** | Mutation function signatures |
| 4 | **Composed Type** | Full assembled board object |

### Drag & Drop

Uses `@dnd-kit` (not React DnD). Drag is disabled when notes or the board are locked. Separate sensor configs exist for mouse, touch, and keyboard.

---

## Code Conventions

### File & Directory Naming

| Type | Convention | Example |
|------|-----------|---------|
| React components | PascalCase | `BoardToolbar.tsx`, `CommandDeck.tsx` |
| Server/model files | snake_case | `board_model.ts`, `db_config.ts` |
| Type files | snake_case + `.types.ts` | `board.types.ts` |
| Route resource files | kebab-case with dots | `board.notes.ts`, `board.settings.ts` |
| Hooks | camelCase with `use` prefix | `useAuth.ts`, `useTheme.ts` |

### Styling

- **Tailwind CSS v4** — utility classes only; no CSS modules, no CSS-in-JS.
- Use the `cn()` helper (`clsx` + `tailwind-merge`) for conditional classes.
- Dark mode via `.dark` class on `<html>`.
- Color scheme: blue (primary), green (secondary), amber (warnings), red (danger).

### Component Props

Pass `isOwner`, `isReadOnly`, and `readonly` flags through props/context rather than re-fetching permissions in child components.

### File Headers

Add a short comment block at the top of new files explaining purpose:

```ts
// app/server/my_model.ts
// Database operations for [domain]. All queries use parameterized SQL.
```

---

## Testing

**Framework:** Vitest 4 + React Testing Library (jsdom environment)

Test files mirror source files: `foo.ts` → `foo.test.ts` in the same directory.

```bash
npm test            # Run all tests
```

**Workflow — write tests first:**
1. Write a failing test that describes the expected behaviour.
2. Implement the feature until the test passes.
3. Refactor if needed; tests must remain green.

**Patterns in use:**
- `describe / it / expect` structure
- `vi.mock()` for session, database, and environment variable dependencies
- Auth flows tested with mocked `process.env` OAuth vars
- Component tests use `@testing-library/react` `render` + `screen` queries

When adding a new route or model, add a corresponding `*.test.ts` file. Mock the database (`pg`) and session (`session.server`) — do not test against a real database.

---

## TypeScript

- Strict mode enabled (`"strict": true`).
- Target: ES2022.
- Path alias: `~/*` → `./app/*` (use `~/` for all intra-app imports).
- JSX transform: `"react-jsx"` (no need to import React in component files).
- Run `npm run typecheck` (which calls `react-router typegen && tsc`) to regenerate route types and validate.

---

## Docker

Multi-stage build:
1. `development-dependencies` — installs all deps
2. `production-dependencies` — installs prod-only deps
3. `build` — runs `npm run build`
4. `runtime` — minimal image serving the build

Build and run locally:
```bash
docker build -t retrograde .
docker run -p 3000:3000 --env-file .env retrograde
```

---

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `app/root.tsx` | Root layout, error boundary, global providers |
| `app/routes.ts` | All route definitions |
| `app/session.server.ts` | Session cookie setup |
| `app/features.ts` | Feature flags |
| `app/context/BoardContext.tsx` | Board state management (central hub) |
| `app/server/board_model.ts` | All board-related SQL queries |
| `app/server/db_init.ts` | Schema initialization (run on startup) |
| `app/server/db_config.ts` | Database pool and every environment variable, validated at startup |
| `app/server/board.types.ts` | Shared type definitions (4-layer system) |
| `app/components/CommandDeck.tsx` | Facilitator control panel UI |
| `vite.config.ts` | Vite + React Router + Tailwind plugin config |
| `react-router.config.ts` | SSR enabled |
| `vitest.config.ts` | Test runner configuration |

---

## What Not To Do

- Do not use an ORM — keep queries as raw parameterized SQL.
- Do not use a global state dispatcher bus — use separate fetchers per concern.
- Do not import from `react-router-dom` — import from `react-router` (v7).
- Do not use CSS modules or styled-components — use Tailwind utility classes.
- Do not commit `.env` files or hardcode any secret in source code.
- Do not collapse the 4-layer type system in `board.types.ts`.
- Do not add migration files — schema changes go in `db_init.ts` as idempotent DDL.
- Do not scatter `process.env` references — read config from `app/server/db_config.ts`.
- Do not make a deployment edit source to configure itself — add an environment variable (ADR-0017).
- Do not write functions longer than 150 lines — break them up.
- Do not ship a feature without a corresponding test.
- Do not introduce a new language without strong justification — default to TypeScript.
