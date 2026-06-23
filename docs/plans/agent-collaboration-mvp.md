# Plan: Agent-Collaboration MVP — Bulk-create boards from an API

## Context

This plan delivers the first concrete slice of retrograde's "AI agents as first-class citizens" strategy (see `docs/STATE.md` and project memory). The user story being addressed:

> "As an AI Agent working on a long planning task (e.g., a roadmap with many items), who wants humans to review, categorize, and prioritize ideas, I would like a way to organize a large idea session beyond what fits in a chat interface, so we can collaborate on long-running tasks."

**The shape of the interaction:**
1. Agent calls a JSON API to create a board with **custom columns** + 50+ notes in two requests.
2. Agent hands the human(s) a shareable URL.
3. Humans use the existing UI to drag, vote, edit, add notes — async, no chat.
4. Agent later calls a JSON API to read the final state and act on it.

**Why now:** Aligns with the AI-native direction confirmed on 2026-05-24. Captcha is already removed; this is the next concrete step. Keeps the door open for a later MCP server, per-user API keys, and persistent agent identity — none of which are MVP.

**Why this slice (and not more):** Smallest end-to-end path that delivers the user story. Reuses existing patterns (anonymous-user flow, `getBoardServer` DTO) so the new code surface is small.

---

## Approach

### Agent identity (MVP)

Reuse the existing **anonymous-user flow** (`getOrCreateUser` / `createAnonymousUser` in `app/hooks/useAuth.ts`), extended with two new user columns:

- `users.is_agent BOOLEAN` — flag so UI/queries can distinguish.
- `users.display_name TEXT` — what the agent self-identifies as ("Claude", "RoadmapBot").

`POST /api/v1/boards` mints an anonymous user with `is_agent=true` and the caller's `display_name`, then returns `{ board_id, board_url, agent_token }`. The `agent_token` is the same session cookie value, surfaced in the body so non-browser clients can use it as `Authorization: Bearer <token>` on subsequent calls.

**Trade-offs accepted:**
- The agent token has no expiry — functionally an unlimited-TTL API key. Acceptable for MVP; rotation = delete the user row.
- Anyone can claim `display_name: "Claude"`. Not verified. The UI marks all agent attribution with `is_agent=true` (a "robot" badge), so humans see the source is agent-claimed not verified.
- Per-board scoping (`users.board_id`) stays — the agent's identity is per-board, not persistent across boards. Persistent identity is a later iteration.

**Alternatives considered (deferred to later iterations):**
- Per-human API keys (`api_keys` table). More accountable but requires a key-management UI. Layer on top of `/api/v1/` later without breaking it.
- Persistent agent-as-user with global identity. The end state, but bundles registry/namespace decisions that shouldn't block this slice.

### New JSON route tree

A parallel `/api/v1/` tree, untouched by the existing form-data UI routes:

```
POST   /api/v1/boards                → create board with custom columns + agent identity
POST   /api/v1/boards/:id/notes      → bulk create notes (array)
GET    /api/v1/boards/:id            → BoardDTO as JSON
```

All three take `Authorization: Bearer <token>` OR `Cookie:` (for in-browser fetch). All use `await request.json()` and `Response.json(...)`. Errors return `{ error: { code, message } }` with HTTP status.

Existing form-data routes (`app/routes/app/board.*.ts`) remain untouched — they serve the React UI via `useFetcher` and have different semantics (redirects, route-returned DTOs for revalidation). Two trees, one shared model layer.

### Board ownership

The agent becomes the owner of boards it creates (a `board_members` row with `role='owner'` against the agent's anonymous user). Consistent with the human anonymous flow. Means agents can access their own Command Deck — first-class. The human receiving the link is a participant (can add, vote, drag, edit; can't change settings unless issue #97's facilitator-role delegation is built).

### Schema changes — one new block in `db_init.ts` (block 18)

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_agent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS display_name TEXT;
```

No new tables.

### Model layer extensions (`app/server/board_model.ts`)

Add (do not modify existing `createBoard` — `board.legacy.tsx` and homepage form depend on it):

```ts
createBoardWithColumns(
  title: string,
  columns: { title: string; prompt?: string }[],
  userId: string | null
): Promise<string>
```

Mirrors `createBoard` transaction shape, iterates caller's columns. Empty array → falls back to the existing 3-column retro default (so the API can also create plain retros).

```ts
bulkInsertNotesServer(
  boardId: string,
  notes: { columnId: string; text: string }[],
  userId: string
): Promise<BoardDTO>
```

**Implementation:** single multi-row INSERT via `unnest($1::text[], $2::text[], …)` parallel arrays. Per-column `note_order` computed via `ROW_NUMBER() OVER (PARTITION BY column_id) + COALESCE(MAX(existing), -1)`. Wrapped in a transaction. Validates every `columnId` belongs to `boardId` first (one `SELECT` against `columns`); rejects entire batch on mismatch. Returns `getBoardServer(boardId, userId)` once at the end.

**Hard cap:** 200 notes per request. Above → 413.

### Author display in `Note.tsx`

Extend the read path:
- `NoteAuthorDTO = { display_name: string; is_agent: boolean }` in `board.types.ts`.
- `NoteDTO.author?: NoteAuthorDTO | null` (preserves the 4-layer type system — does not collapse).
- `getBoardServer` SELECT adds `LEFT JOIN users u ON u.id = n.created_by` and emits `author` via `json_build_object`.

UI change (`Note.tsx`):
- Small footer line above the action bar.
- Human: muted name in gray. Agent: same line with a small robot/sparkle icon, blue tint (per the color scheme convention in CLAUDE.md).
- `author === null` (legacy notes with NULL `created_by`) → render nothing.

Tailwind utilities only. No avatar in MVP.

### Discoverability — `public/llms.txt`

One static file. The emerging convention for AI-readable site documentation. Contents:

- One-paragraph description of retrograde.
- The three API endpoints with example JSON request/response.
- The URL pattern for board sharing.
- A note that `POST /api/v1/boards` requires no auth.

Linked from `<head>` in `app/root.tsx`.

**MCP server is explicitly OUT OF SCOPE.** The HTTP API is the wire format; an MCP wrapper sits on top later without changing it.

---

## Files

### Create
- `app/routes/api/boards.ts` — POST handler
- `app/routes/api/boards.$id.ts` — GET handler
- `app/routes/api/boards.$id.notes.ts` — POST bulk handler
- `app/routes/api/boards.test.ts`
- `app/routes/api/boards.$id.test.ts`
- `app/routes/api/boards.$id.notes.test.ts`
- `public/llms.txt`

### Modify
- `app/server/board_model.ts` — add `createBoardWithColumns`, `bulkInsertNotesServer`; extend `getBoardServer` SELECT to include `author`.
- `app/server/board.types.ts` — add `NoteAuthorDTO`, extend `NoteDTO` with `author?: NoteAuthorDTO | null`. Maintain 4-layer system.
- `app/server/db_init.ts` — append block 18 (the two new user columns).
- `app/hooks/useAuth.ts` — add `getApiUser(request)` (bearer-first, cookie fallback); add `createAgentUser(boardId, displayName)` wrapping `createAnonymousUser`.
- `app/routes.ts` — register the three `/api/v1/...` routes (sibling block, outside `BoardLayout`).
- `app/components/Note.tsx` — render author footer when `note.author` is present.
- `app/components/Note.test.tsx` (new) — author rendering tests.
- `app/server/board_model.test.ts` — add tests for the two new model functions and the `author` join.
- `app/routes/app/board.tsx` — no behavior change, but the loader will pass through the new `author` field automatically once the DTO type updates.
- `app/root.tsx` — add `<link rel="alternate" type="text/markdown" href="/llms.txt" />` in `<head>`.

### Documentation updates
- `docs/STATE.md` — flip the AI-native bullet from "captchas removed" to "captchas removed + first agent API shipped"; add the new API to the "What's Shipped" section.
- `docs/AI_AGENT_API.md` (new) — concise human-and-agent-readable docs for the three endpoints.

---

## Reused utilities (do not rebuild)

- `createAnonymousUser` in `app/hooks/useAuth.ts` — base for `createAgentUser`.
- `getBoardServer` in `app/server/board_model.ts` — already returns a clean DTO; extended with `author` join, served as-is at `GET /api/v1/boards/:id`.
- `BoardDTO` / `NoteDTO` in `app/server/board.types.ts` — already API-shaped.
- Existing `createColumn` and `upsertNoteServer` patterns — referenced for SQL shape, but the bulk path is its own function.
- Anonymous-user session-cookie flow in `app/session.server.ts` — the agent token IS this cookie's value.

---

## Verification

End-to-end manual smoke test (after implementation):

1. **Agent creates a board:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/boards \
     -H 'Content-Type: application/json' \
     -d '{"title":"Roadmap H2 2026","display_name":"Claude","columns":[{"title":"Backend"},{"title":"Frontend"},{"title":"Out of scope"}]}'
   ```
   Expect `{ board_id, board_url, agent_token }`. Visit `board_url` in a browser — see three empty columns.

2. **Agent bulk-adds notes:**
   ```bash
   curl -X POST http://localhost:3000/api/v1/boards/$BOARD_ID/notes \
     -H 'Authorization: Bearer '"$AGENT_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"notes":[{"columnId":"<id>","text":"…"}, …]}'
   ```
   Refresh the browser — see all notes, each with a "Claude 🤖" attribution.

3. **Human interacts:** drag notes between columns, vote on a few, add one human-authored note. The human's note shows their name (or no name if anonymous). The agent's notes show "Claude" with the agent badge.

4. **Agent reads back:**
   ```bash
   curl http://localhost:3000/api/v1/boards/$BOARD_ID
   ```
   Expect full `BoardDTO` JSON with `author` populated; vote counts and column placements reflect human activity.

5. **Run tests:** `npm test` — all new tests pass, none of the existing 173 break.

6. **Run typecheck:** `npm run typecheck` — no NEW errors (pre-existing `unstable_pattern` errors in `docs/STATE.md`'s known rough edges list will still be there).

7. **Verify `llms.txt`:** `curl http://localhost:3000/llms.txt` returns the file. Visit homepage, view source, confirm the `<link>` in `<head>`.

---

## Explicitly OUT of scope (for this plan)

- MCP server.
- Per-user API key management (account-level keys with rotation).
- Persistent agent identity across boards.
- Agent-name verification / namespacing.
- Per-IP rate limiting.
- Pagination on `GET /api/v1/boards/:id`.
- Webhooks or push notifications when humans finish reviewing.
- Updating/deleting notes via the JSON API (the agent creates; humans curate).
- New homepage marketing copy for agents (issue #89 stays separate).

These are good next iterations once this MVP is live and we learn what agents and humans actually do with it.
