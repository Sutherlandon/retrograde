# ADR-0003: Teams are the billing and authorization unit

## Status

Accepted (2026-06-22)

## Context

Retrograde's commercial direction is to monetize the agent layer (see ADR-0001 and the strategy conversation captured in `docs/plans/teams-api-keys-ephemerality.md`). The agent layer plausibly produces 10× the content of a human user, so per-user pricing under-charges accounts running heavy agent workloads and the gate must sit somewhere agent activity flows through.

Two further constraints:

1. We already have a small number of users on the system. We don't want to suddenly paywall features they have today.
2. The "agent discovers retrograde, demos value to a human, human upgrades" loop requires agents to be able to *create* and *contribute* with low friction. Authentication shouldn't be the first thing they hit.

The shape of "who pays" is therefore: a human chooses to authorize agents, and the bill lands on them — not on each agent.

## Decision

Introduce **teams** as the authorization and (future) billing unit in retrograde.

Concretely:

1. **Every registered user has at least one team.** On signup (and as a one-time backfill for existing registered users), each user gets a `is_personal=true` team containing only themselves with `role='owner'`. Personal teams are the default home for a user's solo work.
2. **Boards belong to teams** via a new nullable `boards.team_id`. Nullable because the homepage anonymous-flow keeps working without auth: anonymous boards stay teamless (see ADR-0005).
3. **API keys are minted per team** (see ADR-0004). All API key activity is attributed to the team that minted the key.
4. **Future billing is per team.** A team carries the subscription (or lack of one). One human can own multiple teams (e.g., personal + work team) with separate billing.
5. **Personal teams are not deletable** by their member. They're the user's perpetual home; deleting a personal team would orphan boards. Future "team management" UI exposes named non-personal teams; personal teams stay implicit.

The schema:

```sql
teams         (id, name, is_personal, created_at)
team_members  (team_id, user_id, role, created_at)  -- role: 'owner' | 'admin' | 'member'
boards.team_id -- nullable
```

## Consequences

**Positive:**

- A clean place to attach a paywall later: `teams.subscription_status`, `teams.plan`, etc. — adds a column without redesign.
- Naturally supports multi-human teams (issue #72) and delegatable facilitator roles (issue #97) — both become "role on the team."
- Per-team API keys (ADR-0004) give each team an isolated agent surface that can be revoked en masse.
- Existing users are unaffected at the data layer: their existing boards get backfilled into their personal team.

**Negative / load-bearing:**

- Every code path that creates a board has to decide which team it belongs to (or pass `null` for the trial pool). The decision is one line, but it's now a required branch.
- Personal teams are a bit of a fiction — the user never asks for one; the system auto-creates it. The UI should mostly hide that detail and surface "your boards" / "this board belongs to: Personal" only when teams matter.
- The personal-team backfill (block 24-25 in `db_init.ts`) is the first server-side migration that does more than DDL. It's idempotent and transactional, but adds startup cost on first deploy.
- Anonymous-flow boards stay teamless. This means there are now three categories of board in the system (teamless pre-cutoff = grandfathered, teamless post-cutoff = trial-with-TTL, on-team = paid/personal). That trichotomy is a real cognitive load — captured in ADR-0005.

## Alternatives Considered

1. **Per-user billing instead of per-team.** Simpler conceptually. Rejected because: (a) one user might want a personal tier and a separate team tier (e.g., consulting client work); (b) agent activity needs to be attributable to a unit larger than a single human for inviting collaborators to share the cost; (c) the marketing story for "your team uses retrograde" sells better than "you and your tools individually."

2. **Skip teams; attach API keys directly to users.** Saves a table. Rejected because: (a) keys would need re-issuing if the team grows beyond one person; (b) makes the path to multi-member teams (issue #72) a breaking change instead of an additive one; (c) bills per user, not per workload.

3. **Teams without personal teams; users only have a team after they create one.** Simpler initial UX (no implicit team). Rejected because: (a) backfill becomes opt-in and many existing users would never opt in, leaving their boards teamless forever; (b) creates a "log in, see no boards" empty state for any user who hasn't created a team; (c) the personal team is a useful default home regardless of whether the user ever invites anyone.

## References

- ADR-0001 (agents as first-class citizens) — establishes the strategic frame.
- ADR-0004 (API keys for agent auth) — teams own the keys.
- ADR-0005 (free-tier ephemerality) — teams' boards are exempt from the TTL.
- GitHub issue #72 (Teams), #59 (Paywall), #97 (Facilitator Role).
- `docs/plans/teams-api-keys-ephemerality.md` — implementation plan.
