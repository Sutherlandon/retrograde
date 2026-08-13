# Plan: Teams + API Keys + Free-Tier Ephemerality — the monetization foundation

## Context

Retrograde is positioning agents as first-class participants (ADR-0001). Agents will plausibly add 10× the content of human users, so the agent layer is the right place for a paywall. But a hard paywall would break existing users and kill the "agent discovers, demos, sells to human" loop that makes the AI-native strategy work.

The framing from a strategy conversation on 2026-06-21:

- **The gate isn't "agents cost money"** — it's **"permanence and control cost money."**
- **Free tier:** anyone (agent or human) can create a board; the board is ephemeral (auto-archives after N days).
- **Paid tier:** teams. A team owner pays, mints unlimited API keys for agents, and their team's boards are permanent.
- **Human pays; agents discover for free** — the bill lands on humans who decide the value is real.
- **Existing users are grandfathered** — boards created before the cutoff stay permanent forever.

This plan lays the structural foundation: teams, team-scoped API keys, board↔team association, personal-team migration for existing users, the grandfather cutoff, and a daily auto-archive cron. **Billing integration (Stripe, subscription state) is explicitly deferred** — this plan ships the structural gate; flipping the paywall on top is a later iteration.

## Approach

### Three new ADRs (no code dependency)

- **ADR-0003: Teams as the billing and authorization unit.** Establishes the team concept, why team-not-user, the personal-team convention, and the relationship to issue #97 (Facilitator Role can be a team-level grant in the future).
- **ADR-0004: API keys for agent authentication.** Captures the move from "agent_token = session cookie value, per-board, no expiry" to "API key = team-scoped, hashed-at-rest, revocable, per-key agent identity." Documents backward compat: existing per-board agent_token flow still works for unauthenticated trial boards.
- **ADR-0005: Free-tier ephemerality.** Captures the grandfather cutoff (2026-06-22), the 30-day TTL for new free-tier boards, the rule that boards on a team are exempt, the rule that the homepage anonymous-flow stays teamless (the trial pool).

### Schema (db_init.ts blocks 20–25)

```sql
-- 20 Teams: the billing + authorization unit.
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_personal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 21 Team membership.
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- 22 API keys: team-scoped, hashed.
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  display_name TEXT NOT NULL,
  agent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_keys_team_id ON api_keys(team_id);

-- 23 Boards belong to teams (nullable: teamless = trial pool).
ALTER TABLE boards ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_boards_team_id ON boards(team_id);

-- 24 Personal-team backfill for every existing registered (non-anonymous) user.
INSERT INTO teams (id, name, is_personal)
SELECT gen_random_uuid(), COALESCE(u.preferred_username, u.name, u.email, 'Personal') || ' (personal)', TRUE
FROM users u
WHERE u.is_anonymous = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE tm.user_id = u.id AND t.is_personal = TRUE
  );

-- (companion) Link each registered user to their new personal team as owner.
INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM users u
JOIN teams t ON t.is_personal = TRUE AND t.name LIKE COALESCE(u.preferred_username, u.name, u.email, 'Personal') || ' (personal)'
WHERE u.is_anonymous = FALSE
ON CONFLICT (team_id, user_id) DO NOTHING;

-- 25 Backfill boards.team_id for every existing board owned by a registered user.
-- Anonymous-flow boards remain teamless (the trial pool).
UPDATE boards b
SET team_id = (
  SELECT tm.team_id
  FROM board_members bm
  JOIN team_members tm ON tm.user_id = bm.user_id
  JOIN teams t ON t.id = tm.team_id AND t.is_personal = TRUE
  WHERE bm.board_id = b.id AND bm.role = 'owner'
  LIMIT 1
)
WHERE b.team_id IS NULL;
```

**The personal-team backfill is the trickiest part** — block 24 uses `name LIKE` which is brittle. A cleaner alternative is a server-side migration step (a one-time function called from `db_init.ts` after the DDL) that iterates users and creates teams+members in a transaction. Implementation will use that approach; the SQL above is the conceptual sketch.

### Grandfather cutoff

A single timestamp constant in `app/config/siteConfig.ts`:

```ts
// Boards created before this date are exempt from the free-tier TTL.
// Set on the date Teams + TTL shipped so no existing user wakes up
// to find their boards auto-archived.
export const GRANDFATHER_CUTOFF = '2026-06-22T00:00:00Z';
```

The auto-archive cron's WHERE clause includes `b.created_at > '2026-06-22T00:00:00Z'` so historical boards are untouched.

### API key format and hashing

- Format: `rk_live_<24-char-base64url>` (full key ~32 chars after the prefix). The `rk_live_` prefix makes keys recognizable in logs and code-review.
- Stored: `key_hash = SHA-256(full_key)` and `key_prefix = first 12 chars (e.g., "rk_live_abc1")`. Full key is shown ONCE at mint time; never recoverable after.
- New `app/server/api_key.ts` exports `generateApiKey()`, `hashApiKey(key)`, `findApiKeyByValue(key)`.

### Agent identity per API key (one agent user per key)

When an API key is minted, the server creates an agent user (`is_agent=true`, `display_name` from the key's `display_name`) and stores `api_keys.agent_user_id = <that user>`. All notes created with that key are attributed to that agent user. This means a team can have multiple API keys, each producing a distinct agent identity (e.g., "Claude (roadmap)" vs. "GPT-4 (planning)").

The agent user is NOT a member of any team_members row — `api_keys.team_id` is the link. (We could add the agent to team_members, but that conflates "humans who can act in this team via UI" with "agent identities owned by this team." Cleaner to keep them separate.)

### Auth refactor — `getApiUser` (in `app/hooks/useAuth.ts`)

```ts
export async function getApiUser(request: Request) {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();

    // NEW: real API key path
    if (token.startsWith("rk_live_")) {
      const apiKey = await findApiKeyByValue(token); // hashes + looks up
      if (apiKey && !apiKey.revoked_at) {
        await touchApiKeyLastUsed(apiKey.id); // fire-and-forget UPDATE
        const userRows = await pool.query("SELECT * FROM users WHERE id = $1", [apiKey.agent_user_id]);
        if (userRows.rows[0]) {
          return {
            id: userRows.rows[0].id,
            username: userRows.rows[0].display_name,
            teamId: apiKey.team_id, // NEW
          };
        }
      }
      return null;
    }

    // EXISTING: legacy bearer-token-as-session-cookie path (backward compat)
    // ... unchanged logic ...
  }
  return getOptionalUser(request);
}
```

The `teamId` field on the returned user is new — routes that create boards check it and set `boards.team_id` accordingly.

### Board creation flow

| Caller | Auth | Board's team_id | TTL? |
|---|---|---|---|
| Homepage form (anon) | None | NULL | YES (30d after cutoff) |
| Browser-logged-in user | Cookie | User's personal team | NO |
| Agent with API key | `Bearer rk_live_…` | Team from API key | NO |
| Agent with legacy session token | `Bearer <session>` | NULL (legacy trial) | YES |

`createBoardWithColumns(title, columns, userId, teamId?)` gains a `teamId` parameter that defaults to `null`. The route layer decides what to pass.

### Auto-archive cron

- New route: `POST /api/v1/cron/archive-stale` (POST so casual GETs don't trigger it).
- Auth: must include `Authorization: Bearer <CRON_SECRET>` header. The env var is checked at route boundary.
- Logic:
  ```sql
  UPDATE boards
  SET archived_at = NOW()
  WHERE team_id IS NULL
    AND archived_at IS NULL
    AND created_at > '2026-06-22T00:00:00Z'   -- grandfather
    AND created_at < NOW() - INTERVAL '30 days';
  ```
- Scheduling: `vercel.json` cron config invokes the endpoint daily at 03:00 UTC.
- Defensive: route returns count of archived boards as JSON so future cron logs are inspectable.

### API key minting UI

- New route: `/app/account/api-keys` (loader: list keys for the user's personal team; action: mint or revoke).
- New component or inline JSX in the route file.
- On mint:
  - Form posts `display_name`.
  - Action generates a key, hashes it, creates the agent user, inserts `api_keys` row.
  - Response includes the full key value (in actionData) — UI shows it ONCE with a copy button and a warning that it won't be shown again.
- List shows: `display_name`, `key_prefix` (e.g., `rk_live_abc1…`), `created_at`, `last_used_at`, Revoke button.
- AccountHub gets a new link: "API Keys" (gated on `isAuthenticated`).

### OAuth callback: auto-create personal team for new users

In `app/routes/auth/callback.ts`, after the user is upserted, ensure a personal team exists:

```ts
await ensurePersonalTeam(user.id, user.preferred_username);
```

`ensurePersonalTeam` is idempotent (no-op if the team already exists). Lives in `app/server/team_model.ts`.

## Files

### Create

- `docs/adr/0003-teams-as-billing-unit.md`
- `docs/adr/0004-api-keys-for-agent-auth.md`
- `docs/adr/0005-free-tier-ephemerality.md`
- `app/server/team_model.ts` — `ensurePersonalTeam`, `getTeamForUser`, `getTeamMembers`, plus CRUD wrappers.
- `app/server/team_model.test.ts`
- `app/server/api_key.ts` — `generateApiKey`, `hashApiKey`, `findApiKeyByValue`, `mintApiKey`, `revokeApiKey`, `listApiKeysForTeam`, `touchApiKeyLastUsed`.
- `app/server/api_key.test.ts`
- `app/server/auto_archive.ts` — the SQL query as a single exported function for testability.
- `app/server/auto_archive.test.ts`
- `app/routes/app/account.api-keys.tsx` — loader + action + UI.
- `app/routes/app/account.api-keys.test.ts`
- `app/routes/api/cron.archive-stale.ts` — POST handler with secret check.
- `app/routes/api/cron.archive-stale.test.ts`
- `app/config/grandfather.ts` — exports `GRANDFATHER_CUTOFF` and `FREE_TIER_TTL_DAYS = 30`.
- `vercel.json` — cron config (or merge if file exists).

### Modify

- `app/server/db_init.ts` — append blocks 20–23 (DDL) and call a new function `runPersonalTeamBackfill()` from the model layer to handle blocks 24–25 (server-side, transactional, idempotent).
- `app/server/board.types.ts` — add `TeamDTO`, `ApiKeyDTO` (with `key_prefix` only, never the full key), extend the user-from-auth shape with `teamId?: string`.
- `app/server/board_model.ts` — `createBoardWithColumns` accepts `teamId?: string`; `getBoardServer` returns `team_id` in the DTO.
- `app/hooks/useAuth.ts` — `getApiUser` gains the `rk_live_` path; `createAgentUser` is now called from `mintApiKey` instead of from `POST /api/v1/boards` for authenticated keys.
- `app/routes/api/boards.ts` — if `user.teamId` present, pass it to `createBoardWithColumns`; otherwise behave as today (trial flow, no team).
- `app/routes/auth/callback.ts` — call `ensurePersonalTeam` after user upsert.
- `app/components/AccountHub.tsx` — add "API Keys" link under the dashboard link.
- `app/routes.ts` — register `/app/account/api-keys` and `/api/v1/cron/archive-stale`.
- `app/config/siteConfig.ts` — re-export `GRANDFATHER_CUTOFF` for convenience (or just import from `grandfather.ts` where needed; either is fine).
- `docs/STATE.md` — new section "Teams + API Keys + Free-tier ephemerality (shipped <date>)".
- `docs/AI_AGENT_API.md` — document API key auth as preferred; explain trial vs. team flow.
- `public/llms.txt` — same explanation.
- `docs/adr/README.md` — add ADRs 0003/0004/0005 to the index.

## Reused utilities (do not rebuild)

- `app/hooks/useAuth.ts:createAgentUser` — already creates `is_agent` users; called from `mintApiKey` to seat each key's agent identity.
- `app/hooks/useAuth.ts:getApiUser` — extended, not replaced; legacy bearer-token-as-session path stays for backward compat with existing agent_token holders.
- `app/server/board_model.ts:archiveBoardServer` — the auto-archive cron uses the same `archived_at = NOW()` semantic, but bypasses the per-board owner check (cron acts as the system).
- `app/routes/app/dashboard.tsx` — its existing `archived_at IS NULL` filter already hides auto-archived boards; no dashboard changes required.
- `app/server/board.types.ts` — the 4-layer type system. Add `TeamDTO`, `ApiKeyDTO` to layer 1; don't add corresponding client types unless the UI needs them.

## Tests

Per `CLAUDE.md` rule #1: tests before implementation. Concretely:

- `team_model.test.ts` — `ensurePersonalTeam` is idempotent; creates one team + one membership; `getTeamForUser` returns it.
- `api_key.test.ts` — `generateApiKey` produces the right format; `hashApiKey` is deterministic; `mintApiKey` creates the agent user, returns the full key once; `findApiKeyByValue` works on the hash; `revokeApiKey` sets `revoked_at` and subsequent `findApiKeyByValue` returns the revoked row (caller decides what to do with it); `findApiKeyByValue` returns null for unknown keys.
- `auto_archive.test.ts` — the query archives only teamless boards older than 30 days created after the grandfather cutoff. Boards on a team, recent boards, pre-cutoff boards, already-archived boards are all left alone. Test by mocking `pool.query` and asserting the SQL + parameters.
- `cron.archive-stale.test.ts` — 401 without CRON_SECRET; 200 with; returns archive count.
- `account.api-keys.test.ts` — loader returns keys for the user's personal team; action mints and includes the key value once; revoke action sets `revoked_at`.
- `board_model.test.ts` — extend existing tests so `createBoardWithColumns` properly threads `teamId` into the INSERT.
- `useAuth.test.ts` — new test for the `rk_live_` path; `getApiUser` returns a user with `teamId` populated.

Mock `pg`, `session.server`, and any time-sensitive bits per existing patterns.

## Verification

End-to-end smoke test extracted to [`docs/tests/teams-api-keys-smoke-test.md`](../tests/teams-api-keys-smoke-test.md). Run that after deploying or against a local dev database to confirm the full feature works.

## Explicitly OUT of scope

- **Billing.** No Stripe, no subscription state, no `teams.is_paid` flag. The structural gate is here; flipping it on requires a future ADR + plan.
- **Team-invite UI.** Personal teams are single-member. Multi-member teams ship in a follow-up tied to issue #72.
- **Per-board team transfer.** A board's team is set at creation; moving boards between teams comes later.
- **API key scopes / permissions.** All API keys have full team-write access. Per-key scopes (read-only, specific boards) are a later iteration.
- **Cron job retries / observability.** Single-shot daily, logs counts. Better observability is later.
- **UI for non-personal team management.** Listing teams, switching active team, etc. — out of scope.
- **Anonymous trial board "claim" flow.** The future "save this trial board to my team" flow that converts trial users to paid is out of scope; the data shape supports it (set `team_id` on an existing board) but no UI yet.
- **Issue #97 (Facilitator Role) integration.** Granting facilitator access to a non-owner is its own feature; this plan only sets up the team-membership scaffolding it would later use.
