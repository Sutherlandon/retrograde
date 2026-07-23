# ADR-0008: API keys are AI crew members, managed on the crew page

## Status

Accepted (2026-07-23)

## Context

ADR-0004 established that API keys are **team-scoped** — `api_keys.team_id` is the
owning link, and each key mints a distinct agent user for attribution. But the
key-management **UI** shipped as a standalone `/app/account/api-keys` page that
only ever operated on the caller's **personal** team (`getPersonalTeamForUser`).
That was a mismatch on two fronts:

- **The data model is per-crew, the UI was per-user.** A named crew could own
  keys (an agent acting on that crew's boards), but there was no surface to mint
  or see them — only the personal team's keys were reachable.
- **The mental model was wrong.** ADR-0001 makes agents first-class citizens and
  ADR-0002 makes their attribution mandatory. A key is not an account setting; it
  is *how an agent joins a crew*. Minting a key is conceptually "add an AI member,"
  the direct parallel to adding a human member — which lives on the crew page
  (ADR-0007 made the crew page the single home for a crew's boards, action items,
  and membership).

Teams/crews are unreleased (same context as ADR-0007's rename), so there is no
back-compat constraint on moving or removing the standalone page.

## Decision

**API-key management moves onto the crew page (`/app/crews/:id`) as an "AI Crew"
section, directly below the human Crew Roster. The standalone
`/app/account/api-keys` route and its sidebar nav item are retired.**

- **Framing: a key is an AI crewmate.** The section lists each key as an agent
  (display name, key prefix, last-active), mints via an "Add AI Crewmate" control,
  and revokes via a per-row action — mirroring the human roster's add/remove.
- **Per-crew, not per-user.** The page loads and mutates keys for *that crew*
  (`listApiKeysForTeam(teamId)`, `mintApiKey(teamId, …)`,
  `revokeApiKey(keyId, teamId)`). Personal keys are managed on the personal crew's
  own page; named-crew keys on theirs. The model layer (ADR-0004) was already
  team-scoped and is unchanged.
- **Owner-gated, but allowed on personal crews.** Minting/revoking requires crew
  ownership — adding an AI member is as sensitive as adding a human one. Unlike
  human `addMember` (blocked on personal crews), minting **is** permitted on a
  personal crew: an agent key is exactly how a solo user brings an agent aboard.
  The key list is visible to all crew members (prefixes only; the full key is
  still shown once at mint time per ADR-0004); mint/revoke controls are
  owner-only.

## Consequences

**Positive:**

- One coherent place to manage a crew: human members and AI members side by side.
  "Who can act in this crew" is answerable on a single page.
- Named crews can finally own and manage their own agent keys through the UI, not
  just the API — closing the gap between ADR-0004's model and the product surface.
- Reinforces the first-class-agent positioning (ADR-0001): agents appear as
  crewmates, not as a buried developer setting.

**Negative / load-bearing:**

- The top-level "API Keys" nav entry is gone; a user looking for keys must now go
  through a crew. Discoverability shifts from "account settings" to "the crew the
  agent belongs to" — intended, but a change in mental model for anyone used to
  the old page.
- Every crew page now carries the once-shown-key reveal UX and its warnings. That
  copy is duplicated conceptually from the old page but is the correct home now.
- Making mint owner-only is stricter than the old page (which let any member of
  the personal team — i.e. the sole owner — mint). No behavior change for personal
  crews (owner == only member), but on named crews non-owner members can no longer
  mint. Accepted: key minting grants crew-wide agent write access.

## Alternatives Considered

1. **Keep the standalone page AND add a crew section.** Rejected: two surfaces for
   the same team-scoped data is exactly the drift ADR-0007 set out to kill.
2. **Keep keys as an account-level page but make it team-aware (a crew picker).**
   Rejected: it keeps the "keys are an account setting" framing, when the decision
   here is that keys are crew membership. Membership belongs on the crew page.
3. **Let any crew member mint keys.** Rejected: minting grants an agent write
   access to the whole crew's boards; gate it behind ownership like human
   membership. (Personal crews are exempted from the human-only `is_personal`
   block so solo users can still add agents.)

## References

- ADR-0001 (agents as first-class citizens), ADR-0002 (mandatory agent
  attribution) — why a key reads as a crewmate, not a setting.
- ADR-0003 (teams as billing/auth unit), ADR-0004 (API keys are team-scoped;
  format, hashing, per-key agent identity) — the model this UI now fully exposes.
- ADR-0007 (crew page is the single home for a crew) — the page this section joins.
- `app/routes/app/crews.$id.tsx` (`CrewAgents` section, `mintKey`/`revokeKey`
  intents), `app/server/api_key.ts`, `app/components/Sidebar.tsx` (nav item
  removed). Retired: `app/routes/app/account.api-keys.tsx`.
