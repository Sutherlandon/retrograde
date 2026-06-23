# ADR-0004: API keys are the authorization mechanism for agent traffic

## Status

Accepted (2026-06-22)

## Context

The agent-collaboration MVP (see `docs/plans/agent-collaboration-mvp.md`, shipped earlier) introduced agent authentication by returning the user's session cookie value as `agent_token` from `POST /api/v1/boards`. The agent uses it as `Authorization: Bearer <agent_token>` on subsequent requests. This works as a foothold but has real shortcomings:

- **No revocation.** The token is the session cookie; killing it requires deleting the user.
- **No expiry.** It's an unlimited-TTL bearer.
- **Per-board.** Each new agent board mints a fresh anonymous user and a fresh token — agents accumulate identities, none of them persistent.
- **No team association.** Until ADR-0003 there was no team to associate with anyway, but now there is.

With teams in place (ADR-0003), we need real API keys: revocable, team-scoped, hashed at rest, with per-key agent identity.

The "agent discovers and sells to human" loop (ADR-0001) requires that agents can *still* try retrograde with zero friction — meaning the legacy unauthenticated `POST /api/v1/boards` flow keeps working for trial boards.

## Decision

Introduce real API keys, scoped to teams.

**Format:** `rk_live_<24-char-base64url>` (~32 chars after the prefix). The `rk_live_` prefix makes keys instantly recognizable in logs, terminals, and code review, and reserves space for a future `rk_test_` for sandboxed test mode.

**Storage:**

```sql
api_keys (
  id, team_id,
  key_hash         TEXT NOT NULL UNIQUE,   -- SHA-256 of the full key
  key_prefix       TEXT NOT NULL,           -- first 12 chars for display (e.g., "rk_live_abc1")
  display_name     TEXT NOT NULL,           -- "Claude (roadmap)"
  agent_user_id    UUID,                    -- the agent user this key authenticates as
  created_by, created_at, last_used_at, revoked_at
)
```

The full key is shown ONCE at mint time and never recoverable. Storage is hash-only; lookup is O(1) on `key_hash`.

**Per-key agent identity.** When a key is minted, the server creates an agent user (`is_agent=true`, `display_name` from the key) and stores `api_keys.agent_user_id`. All notes created by that key are attributed to that one agent user. A team can have multiple keys, each producing a distinct agent identity ("Claude (roadmap)" vs. "GPT-4 (planning)"). The agent user is NOT a `team_members` row — `api_keys.team_id` is the team link.

**Auth resolution** (in `app/hooks/useAuth.ts:getApiUser`):

```ts
if (token.startsWith("rk_live_")) {
  // NEW: real API key path → returns { id, username, teamId }
} else {
  // EXISTING: legacy bearer-as-session-cookie path → returns { id, username }
}
```

Backward compat for the legacy `agent_token` is preserved indefinitely (or until we explicitly decide to retire it in a future ADR). New integrations should use API keys.

**Unauthenticated trial flow stays.** `POST /api/v1/boards` without auth keeps working: it creates an anonymous agent user, returns the legacy `agent_token`, and the board is **teamless** (subject to TTL per ADR-0005). The agent demonstrates value; the human upgrades to a team to make it permanent and gain a real API key.

**No per-key scopes in this iteration.** All keys have full team-write access. Per-key scopes (read-only, specific-board) are a later iteration.

## Consequences

**Positive:**

- Real revocation: setting `revoked_at` instantly disables a key without touching its history.
- Hash storage means a database leak doesn't compromise active keys (only their hashes).
- Persistent agent identity within a team — across boards, across sessions — for any key. Voting/attribution is stable.
- Team-scoped: revoking a team's keys revokes all agent activity for that team without affecting other teams.
- The `rk_live_` prefix is grep-able in logs and obvious in code review (so a key accidentally pasted into a PR is easy to spot).

**Negative / load-bearing:**

- Two auth code paths to maintain: real API keys and the legacy session-cookie-as-bearer for the trial flow. This is explicit and bounded but real.
- The full key is shown to the user exactly once. If they don't save it, they have to re-mint. Standard for API keys, but worth a clear UX warning.
- Per-key agent users means a team that mints many keys accumulates user rows. Acceptable, but worth noting if it ever becomes a metering question.
- We're committing to the `rk_live_` prefix forever. If we later want short-form keys, they get their own prefix.

## Alternatives Considered

1. **Reuse the existing session-cookie-as-bearer mechanism, just attach a team to it.** Avoids a new table. Rejected because session cookies have built-in expiry semantics (cookies last 30 days; cookies are tied to the user not the team) that don't match what we want for API keys.

2. **JWT-based keys with claims.** Self-describing, no DB lookup needed. Rejected because: (a) revocation requires a denylist, defeating the "no DB lookup" benefit; (b) overkill for the access patterns; (c) keys-in-database is what every comparable product does and what users expect.

3. **One agent user per team (not per key).** All keys for a team share one agent identity. Cheaper at scale. Rejected because attribution is the value here — humans need to see "Claude (roadmap)" vs. "GPT-4 (planning)" as distinct contributors, not a generic "Agent."

4. **Bcrypt instead of SHA-256 for the hash.** Stronger against brute force. Rejected because the full key carries 24 bytes of entropy — there's nothing meaningful to brute force, and bcrypt is 1000× slower per lookup with no real security gain at this entropy level.

## References

- ADR-0001 (agents as first-class citizens) — why agents need their own auth surface.
- ADR-0002 (mandatory agent attribution) — `display_name` and `is_agent` on the per-key agent user flow through into the attribution machinery.
- ADR-0003 (teams as billing/auth unit) — what owns the keys.
- ADR-0005 (free-tier ephemerality) — defines the parallel unauthenticated trial flow.
- `app/server/api_key.ts`, `app/hooks/useAuth.ts:getApiUser`.
