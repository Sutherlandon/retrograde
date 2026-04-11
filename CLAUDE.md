# CLAUDE.md — Retrograde

This file describes the codebase structure, development workflows, and conventions for AI assistants working in this repository.

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
├── config/           # App config (siteConfig, db_config)
├── images/           # SVG icon components
├── example-data/     # Sample boards for onboarding/tutorials
├── root.tsx          # Root layout & error boundary
├── routes.ts         # Route configuration
├── session.server.ts # Session cookie management
└── features.ts       # Feature flags
public/               # Static assets (icons, PDFs)
plan/                 # Feature planning documents
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

# Session (required)
SESSION_SECRET=

# Database — use DATABASE_URL OR the individual PG_* vars
DATABASE_URL=
PG_HOST=
PG_USER=
PG_PASSWORD=
PG_SCHEMA=
```

`NODE_ENV=production` auto-enables SSL on the database connection.

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
| `app/server/db_config.ts` | Database connection pool |
| `app/server/board.types.ts` | Shared type definitions (4-layer system) |
| `app/config/siteConfig.ts` | OAuth field mapping, logo, branding |
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
- Do not commit `.env` files.
- Do not collapse the 4-layer type system in `board.types.ts`.
- Do not add migration files — schema changes go in `db_init.ts` as idempotent DDL.
