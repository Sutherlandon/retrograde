# Smoke test: Teams + API Keys + free-tier ephemerality

End-to-end manual verification for the Teams + API Keys + auto-archive feature
shipped 2026-06-22. See [ADR-0003](../adr/0003-teams-as-billing-unit.md),
[ADR-0004](../adr/0004-api-keys-for-agent-auth.md),
[ADR-0005](../adr/0005-free-tier-ephemerality.md), and the implementation
plan at [`docs/plans/0002-teams-api-keys-ephemerality.md`](../plans/0002-teams-api-keys-ephemerality.md).

Run against a local dev database after applying the migrations
(`db_init.ts` runs them on startup). All `curl` and `psql` commands below
assume the dev server is running at `http://localhost:3000`.

---

## 1. Existing user migration

Confirms the personal-team backfill ran correctly and didn't break existing
users' dashboards.

1. Pick a registered (non-anonymous) user from the dev DB.
2. Run the app, log in as that user, hit `/app/dashboard`. **Expect:**
   boards load as before.
3. Verify the backfill:
   ```sql
   SELECT * FROM teams WHERE is_personal = TRUE;
   SELECT * FROM team_members WHERE user_id = '<that user>';
   SELECT team_id FROM boards WHERE created_by = '<that user>';
   ```
   **Expect:** exactly one personal team per registered user, one membership
   row per user, and the user's owned boards have `team_id` populated with
   that team's id.

## 2. New user flow

Confirms `ensurePersonalTeam` runs on first OAuth login.

1. Log in as a brand-new OAuth user (new `external_id`).
2. After callback, repeat the queries from step 1 for the new user.
   **Expect:** personal team exists, membership row exists, both created
   within the last few seconds.

## 3. API key mint + use

Confirms the full API-key flow: mint, authenticate, create board on a team,
attribution rendered for the agent.

1. Visit `/app/account/api-keys`. Mint a key with `display_name = "Claude (test)"`.
   **Expect:** the full key value displayed once with a warning that it won't
   be shown again. Copy the key into `$AGENT_KEY`.
2. Create a board via the key:
   ```bash
   curl -X POST http://localhost:3000/api/v1/boards \
     -H "Authorization: Bearer $AGENT_KEY" \
     -H 'Content-Type: application/json' \
     -d '{"title":"K","columns":[{"title":"Backend"}]}'
   ```
   **Expect:** 201 with `{ board_id, board_url, team_id }`. No `agent_token`
   in the response (you're already authenticated).
3. Verify the board is on the team:
   ```sql
   SELECT team_id FROM boards WHERE id = '<board_id from step 2>';
   ```
   **Expect:** equals the user's personal team id.
4. Add a note via the same key:
   ```bash
   COL_ID=$(curl -s http://localhost:3000/api/v1/boards/<board_id> | jq -r '.columns[0].id')
   curl -X POST http://localhost:3000/api/v1/boards/<board_id>/notes \
     -H "Authorization: Bearer $AGENT_KEY" \
     -H 'Content-Type: application/json' \
     -d "{\"notes\":[{\"columnId\":\"$COL_ID\",\"text\":\"Migrate auth to passkeys\"}]}"
   ```
5. Visit the board in the browser. **Expect:** the note shows the
   "Claude (test)" attribution badge with the robot icon, regardless of the
   `attribution_enabled` board toggle (ADR-0002 guarantee).

## 4. Trial flow (backward compat)

Confirms unauthenticated agents can still create teamless trial boards.

1. Hit the homepage form anonymously, create a board through the UI.
   **Expect:**
   ```sql
   SELECT team_id FROM boards WHERE id = '<that board id>';
   ```
   returns `NULL`.
2. Hit `POST /api/v1/boards` without any auth header:
   ```bash
   curl -X POST http://localhost:3000/api/v1/boards \
     -H 'Content-Type: application/json' \
     -d '{"title":"Trial","display_name":"Demo Agent","columns":[]}'
   ```
   **Expect:** 201 with `{ board_id, board_url, agent_token }`. The board's
   `team_id` is NULL.

## 5. Auto-archive

Confirms the cron archives teamless post-cutoff boards older than 30 days,
and leaves grandfathered/team-owned boards alone.

1. Seed test data:
   ```sql
   -- a) post-cutoff teamless board, 35 days old: SHOULD archive
   UPDATE boards SET created_at = NOW() - INTERVAL '35 days', team_id = NULL
   WHERE id = '<a teamless board created today>';

   -- b) pre-cutoff teamless board, 35 days old: should NOT archive (grandfathered)
   UPDATE boards SET created_at = '2026-05-01T00:00:00Z', team_id = NULL
   WHERE id = '<another teamless board>';

   -- c) team-owned board, 35 days old: should NOT archive
   UPDATE boards SET created_at = NOW() - INTERVAL '35 days'
   WHERE id = '<a team-owned board>';
   ```
2. Trigger the cron:
   ```bash
   curl -X POST http://localhost:3000/api/v1/cron/archive-stale \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
   **Expect:** 200 with `{ archived: 1 }` (only board (a)).
3. Verify:
   ```sql
   SELECT id, team_id, created_at, archived_at FROM boards
   WHERE id IN ('<a>', '<b>', '<c>');
   ```
   **Expect:** (a) has `archived_at` set; (b) and (c) have `archived_at IS NULL`.

## 6. Tests + typecheck

Sanity check the dev environment.

- `npm test` — all 245+ green.
- `npm run typecheck` — no NEW errors beyond the 18 pre-existing
  `unstable_pattern` errors documented in `docs/STATE.md` known rough edges.
