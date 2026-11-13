# 0007 — Version-gated polling

**Status:** Accepted — 2026-11-13

## Why

Every viewer polls `/app/board/:id/poll` every 3 seconds. Each poll runs four
queries (user lookup, access check, the full `getBoardServer` aggregate,
attachments) and downloads the whole board whether or not anything changed. A
hidden tab polls forever. The client cannot tell whether a snapshot is older or
newer than what it shows, so `BoardContext` guesses with the `saveActivity`
counter, and a poll that predates a fetcher write reverts the screen for a
cycle.

WebSockets were considered and rejected: they need a pub/sub fan-out between
function instances, still need a resync path on reconnect, do not serve agents
or self-hosted installs, and do not give snapshots an order.

## What

Each board gets a monotonically increasing **version**. The poll says which
version it has; the server answers "unchanged" from one cheap query and builds
the snapshot only when the version moved. The client applies a snapshot only
when it is not older than what it shows. With an idle poll that cheap, the
interval drops from 3 seconds to 1.

## The contract between server and client

- `BoardDTO.version: number` is present on every snapshot `getBoardServer`
  returns, so every write response, the page loader, the poll and the agent
  API's GET all carry it. The static example boards have none.
- `GET /app/board/:id/poll?v=<n>`:
  - `v` absent or not a non-negative integer: 200 with the full snapshot.
  - `v` equals the board's current version and no running timer has run out:
    **204 No Content**, empty body.
  - otherwise: 200 with the full snapshot.
  - Access is checked on every poll, changed or not: 401/403/404 as today.

## Server

### `board_versions` table and triggers (`db_init.ts`, block 35)

```sql
CREATE TABLE IF NOT EXISTS board_versions (
  board_id TEXT PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  version  BIGINT NOT NULL DEFAULT 0
);
```

A missing row means version 0; readers `COALESCE`. No backfill.

The version lives in its own table, not on `boards`, and is bumped by
**deferred constraint triggers**, so the version row is always the last lock a
transaction takes and nothing waits on anything else while holding it. A
`version` column on `boards` bumped by an immediate trigger deadlocks: a
multi-statement transaction (reorder, bulk add) locks the board row on its
first write and then waits for a note row held by a single-statement edit that
is itself waiting for the board row.

One function, `bump_board_version(board_id)`:

```sql
INSERT INTO board_versions (board_id, version)
SELECT id, 1 FROM boards WHERE id = $1
ON CONFLICT (board_id) DO UPDATE SET version = board_versions.version + 1;
```

The `SELECT ... FROM boards` makes it a no-op for a board deleted earlier in
the same transaction (cascades run before deferred triggers).

Triggers, all `CREATE CONSTRAINT TRIGGER ... AFTER INSERT OR UPDATE OR DELETE
... DEFERRABLE INITIALLY DEFERRED FOR EACH ROW`, each resolving the board id
from `OLD`/`NEW` (both, when an UPDATE moves a row between boards):

| Table | Board id |
|---|---|
| `boards` | `id` (UPDATE and INSERT only; a delete cascades the version row away) |
| `columns` | `board_id` |
| `notes` | `columns.board_id` via `column_id` |
| `note_votes` | via `note_id` → `notes.column_id` → `columns.board_id` |
| `note_likes` | same |
| `action_items` | `board_id` (skip when NULL: crew-level items) |
| `attachments` | `board_id` |
| `board_members` | `board_id` |

Idempotent without taking a table lock on every cold start: the function is
`CREATE OR REPLACE`; each trigger is created inside a `DO` block only when
`pg_trigger` has no row of that name on that table.

The table list, the DDL that builds the triggers, and the list of snapshot
inputs deliberately left untracked live in a new module,
`app/server/board_version.ts`; `db_init.ts` runs the DDL it exports.

**Untracked on purpose:** `teams` (crew name), `team_members` (crew-owner
facilitation), `users` (author display name). They change rarely and not
during a retro; the client's periodic full refresh (below) bounds how stale
they can be.

**The test that keeps this honest** (`board_version.test.ts`): extract every
table named after `FROM`/`JOIN` in the SQL of `getBoardServer` and
`getAttachmentsServer`, and assert each is in the tracked list or the
untracked list. Adding a table to the snapshot fails the test until it is
classified. A second assertion: the DDL creates a trigger for every tracked
table.

### Reading the version

- `getBoardServer` adds `'version', COALESCE((SELECT bv.version FROM
  board_versions bv WHERE bv.board_id = b.id), 0)` to its `json_build_object`,
  in the same statement as the data, so the pair is consistent.
- `getBoardAccess` also selects the version (as text, parsed to a number) and
  `timer_expired` (`b.timer_running AND b.timer_ends_at <= NOW()`), and returns
  both on `BoardAccess`. A new `resolveBoardAccess(request, boardId, opts)`
  returns `{ user, access }` with the same throws as `requireBoardAccess`,
  which becomes a thin wrapper around it.
- `board.poll.ts` calls `resolveBoardAccess`, returns 204 when `v` matches and
  the timer has not run out, else the snapshot. An unchanged poll costs two
  queries (user lookup, access + version) instead of four.

## Client (`BoardContext.tsx`)

- `versionRef` holds the highest version applied. Reset when `boardId` changes.
- **One gate for every server snapshot** — loader data, fetcher responses,
  save responses, polls: a snapshot whose `version` is a number lower than
  `versionRef` is dropped; otherwise it is applied and `versionRef` advances.
  A snapshot with no `version` (example boards) is applied as before.
- The poll:
  - every 1000 ms (`POLL_INTERVAL_MS`);
  - skipped while `document.visibilityState === "hidden"`, and fired at once
    on `visibilitychange` back to visible;
  - sends `?v=<versionRef>`, except that once every 30 seconds
    (`FULL_REFRESH_MS`) it omits `v` to force a full snapshot, which bounds the
    staleness of the untracked inputs;
  - 204: clear offline, nothing else;
  - 200: not applied while `pendingSaves > 0` or any fetcher is not idle
    (their optimistic state is not on the server yet), nor when stale.
- `saveActivity` is deleted: the version compare answers exactly what it
  guessed. `pendingSaves` and the last-response-of-a-burst rule stay.

## Done means

- `npm test` and `npm run typecheck` pass.
- The triggers have been run against a real local Postgres: every tracked
  table bumps, a rolled-back write does not, and the multi-statement vs
  single-statement interleaving does not deadlock.
- ADR-0029 records the decision; `STATE.md`, the action registry (BRD-002) and
  `AI_AGENT_API.md` (the `version` field) are updated; this plan is deleted.

## Out of scope

- A pending-edit overlay re-applied over every snapshot (would retire
  `pendingSaves`).
- Conditional reads (`?v=`) on the agent API's GET.
- Per-note conflict detection.
