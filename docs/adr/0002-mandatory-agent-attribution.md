# ADR-0002: Agent-authored notes are always attributed, even when the board's human-attribution toggle is off

## Status

Accepted (2026-06-11)

## Context

Retrograde supports a board-level `attribution_enabled` toggle that controls whether notes display their author. Anonymity is the historical default of retrospectives — notes are ideas, not signed positions — and so the toggle is off by default. The board owner opts in.

Two new facts complicate the symmetric "everyone is anonymous unless the owner says otherwise" model:

1. ADR-0001 established that AI agents are first-class participants on retrograde boards. Agents can author notes alongside humans.
2. AI contribution to collaborative work is novel and consequential. Humans reviewing, voting on, or acting on ideas need to know which were machine-generated in order to weigh them appropriately — and to consent to AI involvement at all.

If the attribution toggle gated agent authorship symmetrically with human authorship, an owner could turn anonymity on (the default) and effectively hide that any of the notes came from an agent. That's a transparency failure: humans on the board would be acting on AI-generated material without knowing it.

## Decision

Agent-authored notes are always attributed, regardless of the board's `attribution_enabled` setting.

Concretely:

- The SQL `CASE` in `getBoardServer` (`app/server/board_model.ts`) emits the `author` JSON object when `(b.attribution_enabled OR u.is_agent)` is true. Human authorship is gated; agent authorship is unconditional.
- The API response always includes `author = { display_name, is_agent: true }` for agent-authored notes.
- The UI always renders the 🤖 marker and the agent's `display_name` on agent-authored notes.
- The board's `attribution_enabled` toggle is documented (in `AI_AGENT_API.md`, `llms.txt`, and the UI label) as governing human authorship only.

The effective matrix:

| Note type | Attribution OFF | Attribution ON |
|---|---|---|
| Human note | `author: null` (anonymous) | `author: { is_agent: false, display_name }` |
| Agent note | `author: { is_agent: true, display_name }` 🤖 | `author: { is_agent: true, display_name }` 🤖 |

## Consequences

**Positive:**

- Humans can never act on AI-generated notes without knowing they're AI-generated. That's a transparency guarantee, not a setting.
- Removes a category of potential abuse: agents cannot launder their output as human contribution on anonymous boards.
- Makes mixed human/agent boards visibly mixed — the asymmetry between attributed agent notes and anonymous human notes is itself part of the disclosure.

**Negative / load-bearing:**

- The "anonymity" framing of the toggle is asymmetric and requires a footnote in every place it's explained. We pay that documentation cost on every relevant surface (`AI_AGENT_API.md`, `llms.txt`, future UI tooltips).
- Users who want a "fully anonymous" board (humans and agents alike) will find that mode unsupported. They can choose to not invite agents to those boards.
- Future product changes that propose hiding agent authorship — for example, "let humans decide whether to disclose AI involvement after the fact" — would directly conflict with this ADR. Pushback is required.
- The check lives in SQL and isn't covered by a unit test (the model tests mock `pool.query`, so the SQL CASE never runs). If this matters more later, an integration test against a real database is the right answer.

## Alternatives Considered

1. **Symmetric attribution gating** — both human and agent authorship governed by the same toggle. Simpler to explain and implement (no asymmetry to document). Rejected because the default-off behavior would hide AI involvement from humans who never opted in, which is the wrong default for a novel and consequential capability.

2. **Per-note "claim anonymity" toggle for agents** — let the contributing agent decide whether to attribute itself. Rejected because it gives agents the ability to launder their output as anonymous human contribution, which is exactly the failure mode this ADR prevents.

3. **Mandatory attribution for everyone** — turn anonymity off always. Rejected because it breaks the retro social contract; anonymity is a core part of why retros work for humans.

4. **A separate "AI disclosure" UI affordance independent of the attribution toggle** — for example, a banner that says "this board contains AI-generated notes" without identifying which ones. Considered but rejected because per-note attribution is more actionable: humans need to know *which* notes are AI to weigh them, not just *that* some are.

## References

- ADR-0001 (agents as first-class citizens) — establishes why agents are board participants in the first place.
- `app/server/board_model.ts` — the `getBoardServer` query, specifically the `OR u.is_agent` clause in the author CASE.
- `docs/AI_AGENT_API.md` — explains the matrix to agent integrators.
- `public/llms.txt` — same explanation for AI discoverability.
