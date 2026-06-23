# ADR-0005: Free-tier boards are ephemeral; teams and existing accounts are exempt

## Status

Accepted (2026-06-22)

## Context

Retrograde's monetization strategy (see ADR-0003, ADR-0004) gates *permanence and control* behind teams, not *agent participation*. Agents need to be able to create boards with zero friction to enable the "agent discovers, demos, sells to human" loop (ADR-0001). But every board has real storage and compute cost, and an unbounded free tier subsidizes every agent's work indefinitely.

We also have a small existing user base whose boards we promised to keep working. A naïve "everything older than 30 days archives" rule would break that promise.

## Decision

Introduce a free-tier TTL with two carve-outs.

**Default rule:** A board is auto-archived 30 days after `created_at` if:
- `team_id IS NULL` (not on any team), AND
- `created_at > GRANDFATHER_CUTOFF`, AND
- `archived_at IS NULL` (not already archived).

**Carve-outs:**

1. **Boards on a team are never auto-archived** — being on a team (even a personal one) signals "this matters; I have an account here." The team's existence is the proof of permanence intent.

2. **Boards created before the grandfather cutoff** (a single hardcoded timestamp; the date this ADR shipped) are never auto-archived, even if teamless. This protects every existing user's existing boards.

The cutoff is captured as a single exported constant in `app/config/grandfather.ts`:

```ts
export const GRANDFATHER_CUTOFF = '2026-06-22T00:00:00Z';
export const FREE_TIER_TTL_DAYS = 30;
```

**The cron job** at `POST /api/v1/cron/archive-stale` runs daily (Vercel cron, 03:00 UTC), guarded by `Authorization: Bearer $CRON_SECRET`. It executes:

```sql
UPDATE boards
SET archived_at = NOW()
WHERE team_id IS NULL
  AND archived_at IS NULL
  AND created_at > '2026-06-22T00:00:00Z'
  AND created_at < NOW() - INTERVAL '30 days';
```

Returns the count of archived boards for log inspection.

**"Archived" means soft-archived** — the existing dashboard already filters by `archived_at IS NULL`, so auto-archived boards drop out of the active list but remain queryable via `/app/dashboard`'s archived section. Notes, columns, attachments, and memberships are preserved. An archived board is read-only; the user can `unarchiveBoardServer` to restore it (subject to ownership). A future "claim" flow can also re-link a teamless archived board to a team when the owner upgrades.

## Consequences

**Positive:**

- The "agent demos, human pays for permanence" loop has a concrete trigger: when a board is about to age out, that's the conversion moment.
- Storage and compute costs for free-tier boards are bounded in expectation (~30 days of activity per board).
- Existing users see zero change to existing boards.
- The carve-out for team boards means "I created a team" is a clear signal of intent and a clear value boundary.

**Negative / load-bearing:**

- New boards created via the homepage anonymous flow now have an expiry. Users who today expect their boards to live forever will be surprised. **Mitigation:** the cutoff applies only to boards created after the ADR's date, and the UI for anonymous boards should call out the 30-day TTL clearly (out of scope for this ADR, but a follow-up).
- "Archived" is a softer signal than "deleted" — users who want their board back can unarchive — but the dashboard's default view hides them. Some users will think they lost their board. The unarchive affordance must be discoverable.
- The cron is the first scheduled job in the codebase. It introduces a new failure mode (cron didn't run → free boards never age out → storage grows). Observability is intentionally minimal in this iteration; the route returns a count and we trust Vercel cron logs. A failed cron is a deferred problem, not an outage.
- The grandfather cutoff is a magic timestamp. If the deploy slips by a day, we lose a day of carve-out. Acceptable risk; we just set the constant on the actual deploy day, not in advance.

## Alternatives Considered

1. **No TTL; subsidize all free boards forever.** Simpler. Rejected because the agent layer plausibly multiplies traffic and storage cost 10× beyond a human-only baseline, and the whole point of the paywall is to keep heavy users on a paid tier. Unbounded free agent activity makes the business unsustainable.

2. **Hard delete instead of soft archive.** Cleaner cleanup. Rejected because: (a) un-archive is an easy recovery path that meaningfully reduces "I lost my work" complaints; (b) the existing `archived_at` column already does the work; (c) hard delete creates an irreversible action triggered by a cron, which is exactly the kind of thing that goes wrong.

3. **Account-based grandfather (boards owned by accounts created before the cutoff are permanent).** Fairer to long-time users who keep making new free boards. Rejected because: (a) the anonymous-flow boards have no persistent account-by-account identity, so this rule wouldn't apply to most of the existing-user case anyway; (b) it perpetuates a free tier with no commercial pressure to upgrade; (c) the cutoff is simpler and the conversion moment (board about to age out) is sharper.

4. **TTL based on activity, not age.** "30 days since last note." Rejected because: (a) anyone could write a 1-line cron to keep their board alive forever; (b) the operational signal that matters is "this board is still being used by humans who care about it," and adding a single note is too weak a signal — joining a team is a stronger one.

5. **Configurable TTL per-board.** "Owner can extend." Rejected for this iteration because extending = paying = teams = solved by ADR-0003 already. If you want permanence, join a team. Per-board extension is a future plan option, not an MVP feature.

## References

- ADR-0001 (agents as first-class citizens) — why low-friction trial creation matters.
- ADR-0003 (teams as the billing unit) — what "exempt" means.
- ADR-0004 (API keys) — keys belong to teams, so API-key-created boards are automatically on a team and thus exempt.
- `app/config/grandfather.ts` — the cutoff constant.
- `app/server/auto_archive.ts`, `app/routes/api/cron.archive-stale.ts`.
- `app/server/board_model.ts:archiveBoardServer` — the cron uses the same `archived_at = NOW()` semantic but bypasses the per-board owner check.
