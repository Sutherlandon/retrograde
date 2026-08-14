# ADR-0010: Crew boards are members-only by default

## Status

Accepted (2026-07-26)

## Context

Until now, every board in Retrograde was world-readable by URL: anyone with the
link could open `/app/board/:id`, see all notes, and interact. That is the right
default for the anonymous trial flow (ADR-0005) and for a solo user's personal
boards — low friction, easy sharing, "the link is the invite."

But crews (ADR-0003) exist precisely because a group wants a shared, *private*
workspace. A retro often contains candid feedback that shouldn't be one leaked
link away from the whole company. As long as crew boards were world-readable,
the crew boundary was organizational only, not a real access boundary — which
undercuts the entire reason to put a board on a crew.

The board DTO also deliberately hides author identity unless attribution is on
(ADR-0002), so "who can see this board" could never be answered client-side; it
had to become a server-enforced rule.

## Decision

**A crew can restrict its boards to crew members, and named crews do so by
default. Personal crews never restrict (their boards keep the anyone-with-the-link
behavior).**

- **Schema:** `teams.restrict_board_access BOOLEAN NOT NULL DEFAULT TRUE`.
  Personal crews are forced `FALSE` (in `ensurePersonalTeam` and a one-time,
  idempotent startup reset — safe to re-run because personal crews never expose
  the toggle). So the effective default is: **named crew → members-only; personal
  crew → open; teamless board → open.**

- **Enforcement lives in one server-side guard**, `getBoardAccess(boardId,
  userId, apiTeamId?)` (`app/server/board_permissions.ts`). A board is accessible
  when it is teamless, its crew isn't restricted, **or** the caller is a crew
  member, one of the board's own owner/facilitators, or an agent whose API key
  belongs to that crew (ADR-0004). `requireBoardAccess` wraps it for routes:
  - The board **page** loader redirects an anonymous caller to log in (they may
    be a member who just isn't signed in) and 403s a registered non-member.
  - The **poll** loader and **JSON API** (`GET /api/v1/boards/:id`) enforce the
    same rule, returning 401/403 so a fetcher or agent gets a clean error rather
    than a redirect.

- **Toggle** on the crew page Settings section (owner-only, hidden for personal
  crews): "Members-only boards." Off restores the legacy anyone-with-the-link
  behavior for that crew's boards.

- **Scope is read/open access.** Editing was already "anyone who can open the
  board can edit it," and note/column ids are unguessable UUIDs, so gating *open*
  access effectively gates meaningful writes too (you can't craft a mutation
  without first reading the board). Per-action edit permissions remain a separate,
  future concern.

## Consequences

**Positive:**

- The crew boundary is now a real privacy boundary — the reason to adopt a crew.
- One choke point (`getBoardAccess`) governs page, poll, and API, so the rule
  can't drift between surfaces, and author anonymity (ADR-0002) is preserved
  because the filter runs in SQL on `created_by`/membership, never in the DTO.
- Agents keep working against their own crew's boards via their team-scoped key,
  with no new auth step — consistent with ADR-0004.

**Negative / load-bearing:**

- **Existing named-crew boards flip to members-only on deploy.** This is the
  intended default, but any board that was being shared by link to non-members
  will stop opening for them until the crew owner turns the toggle off (or adds
  them). Pre-launch this affects no real users; post-launch it would be a
  visible behavior change worth announcing.
- A member who opens a crew board while logged out gets bounced to login rather
  than the board — correct, but a small friction cost versus the old instant-open.
- `restrict_board_access` is only *read*-enforced. A future "who can edit"
  feature must not assume this flag already gates writes at the per-action level;
  it gates them only transitively (via needing read to obtain ids).

## Alternatives Considered

1. **Per-board visibility instead of per-crew.** More granular. Rejected for v1:
   the crew is already the sharing unit users reason about; a per-board setting
   multiplies controls without a clear need. A crew-level default with a per-board
   override could come later.
2. **Default off (opt-in privacy).** Safer for backward compatibility. Rejected:
   the whole point of a crew is a private shared space; making privacy opt-in
   would leave most crews accidentally public, which is the failure mode this ADR
   exists to prevent. Personal crews (the compatibility-sensitive case) are
   exempted instead.
3. **Filter notes per-viewer but still let anyone load the board shell.**
   Rejected: partial access still leaks board existence, title, structure, and
   participant counts; "members-only" should mean the board doesn't open at all.
4. **Enforce in `getBoardServer` directly.** Rejected: `getBoardServer` is also
   used for internal composition and returns `null` for not-found; overloading it
   with an authorization decision would entangle "does it exist" with "may you see
   it" and force a userId through every internal caller. A dedicated guard keeps
   the concerns separate.

## References

- ADR-0003 (teams/crews as the authorization unit) — the boundary this makes real.
- ADR-0004 (API keys are team-scoped) — how agents pass the members-only check.
- ADR-0002 (mandatory agent attribution / hidden human authorship) — why the
  filter must be server-side, not in the DTO.
- ADR-0005 (free-tier ephemerality) — teamless/personal boards stay open, which
  this preserves.
- `app/server/board_permissions.ts` (`getBoardAccess`, `requireBoardAccess`),
  `app/server/team_model.ts` (`setTeamBoardRestriction`, `ensurePersonalTeam`),
  `app/routes/app/board.tsx` / `board.poll.ts` / `routes/api/board.ts` (enforcement),
  `app/routes/app/crews.$id.tsx` (the toggle), `app/server/db_init.ts` (schema).
