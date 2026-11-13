# ADR-0029: A board version gates the poll; no WebSockets

## Status

Accepted (2026-11-13)

## Context

Every viewer polled `/app/board/:id/poll` every 3 seconds. Each poll ran four queries (user lookup, access check, the full `getBoardServer` aggregate, attachments) and downloaded the whole board whether or not anything had changed, and a tab left open in the background polled forever. That was affordable for a toy and is not for a paid product on Neon and Vercel.

The client also had no way to order two snapshots. `BoardContext` guessed with a `saveActivity` counter whether a poll predated a save, and a poll that predated a write made through a fetcher reverted the screen until the next poll.

WebSockets were the obvious alternative and were rejected. A write lands on one function instance and the other viewers' sockets live on others, so push needs a pub/sub layer (Redis, or Postgres `LISTEN` on a direct connection per instance, which keeps the Neon compute awake). Sockets close at the function's maximum duration, so a resync path — a poll — is needed anyway. Agents read over the JSON API and self-hosted installs run `react-router-serve`, so polling would have to stay for both. And a socket still delivers snapshots with nothing to order them by.

## Decision

1. **Every board has a version.** `board_versions(board_id, version)` holds a counter that only moves forward. A missing row is version 0.
2. **Triggers bump it, not application code.** Every table whose rows appear in a board snapshot — `boards`, `columns`, `notes`, `note_votes`, `note_likes`, `action_items`, `attachments`, `board_members` — has a trigger that bumps the board's version. A write path cannot forget. `app/server/board_version.ts` owns the list and generates the DDL; `db_init.ts` block 35 runs it.
3. **The version is its own table and the triggers are deferred.** They are `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED`, so the version row is the last lock every transaction takes and nothing waits on another lock while holding it. A `version` column on `boards` bumped by an immediate trigger deadlocks: a multi-statement transaction (reorder, bulk add) takes the board row on its first write and then waits for a note row held by a single-statement edit that is itself waiting for the board row.
4. **Three snapshot inputs are deliberately untracked:** `teams` (crew name), `team_members` (crew-owner facilitation) and `users` (author display name). They are not board-scoped and do not change during a retro. The client's periodic full refresh (§7) bounds how stale they can get. A test extracts every table the snapshot SQL reads and fails until each is listed as tracked or untracked.
5. **The snapshot carries its version.** `getBoardServer` reads it in the same statement as the data, so every write response, the page loader, the poll and the agent API's GET return a consistent pair.
6. **The poll is conditional.** `GET /app/board/:id/poll?v=<n>` answers 204 with no body when `n` is the current version and no running timer has run out; otherwise the full snapshot. Access is checked on every poll, and the version comes back from the access query, so an unchanged poll costs two queries (user lookup, access + version) and no payload.
7. **The client polls every second.** It skips while the tab is hidden and polls at once when it becomes visible. Every 30 seconds it omits `v` to force a full snapshot.
8. **One gate orders every snapshot.** Loader data, fetcher responses, save responses and polls all pass through it: a snapshot older than the one on screen is dropped. This replaces `saveActivity`. A poll is still set aside while a save or fetcher is in flight, because their optimistic state is not on the server yet.

## Consequences

**Positive**
- An idle board costs two small queries per viewer per second instead of four queries and a full board every three, and nothing while its tab is hidden.
- Other people's changes appear within about a second.
- A stale response can no longer overwrite a newer one, whichever transport carried it.
- If push is ever wanted, the version is the message to send.

**Negative / load-bearing**
- A new table added to the snapshot must be classified in `board_version.ts`; the test enforces it. Leaving one untracked means up to 30 seconds of staleness for that data.
- A statement that changes N rows bumps the version N times. Only order matters; do not read the number as a count of writes.
- The version says a snapshot is older or newer, not what differs. Two people editing the same note is still last write wins.
- Triggers are invisible from the model layer. A write that seems to do nothing extra takes a lock on the board's version row at commit.
- The first startup on an existing database takes a brief lock on each tracked table to create its trigger. Later startups only check that it exists.

## Alternatives rejected

- **WebSockets or SSE** — see Context.
- **`boards.version` with immediate triggers** — deadlocks, see §3.
- **Bumping the version in each model function** — a missed call is a silent stale read, and there are dozens of write paths.
- **`MAX(updated_at)` across the tables** — most have no such column, deletes leave no trace, and timestamps are not strictly ordered.
