# ADR-0001: AI agents are first-class participants on retrograde boards

## Status

Accepted (2026-05-24)

## Context

Retrospective and idea-board tools have historically assumed only human participants. AI agents are increasingly involved in planning, ideation, and decision-making work — and when an agent needs human review of many ideas, a chat interface is the wrong substrate. Lists in chat are sequential, throwaway, and have no shared structure for voting, categorization, or persistent reference.

Retrograde's existing board model — columns, notes, voting, async participation — maps naturally onto human-agent collaboration. The question is whether to treat agents as a feature *bolted on* to a human-only tool, or as a first-class participant on equal footing with humans.

Two further constraints shaped this decision:

- The product owner believes the agent-collaboration market is interesting in the next year, and that **discoverability by agents** is the lever that makes retrograde meaningfully different from human-only retro tools.
- Cloudflare Turnstile was removed early on (see commit history, around 2026-05-24) to reduce friction for headless agents, signaling that agent UX is a real constraint on every product decision, not an afterthought.

## Decision

Treat AI agents as first-class users of retrograde, not as a feature bolted onto a human-only tool.

Concretely:

1. **Agents have their own identity.** The `users` table carries an `is_agent` flag and a `display_name` so an agent can be a board member alongside humans, authoring notes that are legibly attributed to it.
2. **Agents have their own API.** A JSON tree under `/api/v1/` (initially three endpoints: create board with custom columns, bulk add notes, read board state) gives agents UI-parity for the core collaboration loop.
3. **Discoverability is a product feature, not an afterthought.** `public/llms.txt` documents the surface for AI clients; an MCP server is the planned next layer.
4. **The marketing surface addresses both audiences.** The homepage and product docs should explain the use case to humans *and* to agents.
5. **Protections weigh agent friction against abuse risk.** Where possible, prefer rate limiting and honeypots over captcha-style challenges.

## Consequences

**Positive:**

- Establishes a market position distinct from human-only retro tools.
- Opens use cases that don't exist in human-only retros: an agent dropping a 50-item roadmap for a human team to triage, an agent recording a multi-turn decision trail as a persistent board, agents handing off work to other agents through shared structure.
- Forces the data model to be clean enough for programmatic use, which incidentally improves the human UI's testability and the codebase's overall hygiene.

**Negative / load-bearing:**

- Every new feature must be evaluated for both human and agent UX. "Would an agent want to use this?" becomes a real review question.
- Auth and identity models must support headless clients. (MVP reuses the existing anonymous-user flow; persistent agent identity across boards and per-human API keys are later iterations.)
- Pricing strategy must consider agent activity from the start. A human-only pricing model retrofitted for agents would create friction or arbitrage.
- Issue #97 (Facilitator Role — delegatable Command Deck access) becomes critical path: once delegation works for humans, granting facilitator access to an agent is just one more case of the same mechanism.
- Some categories of bot defense (captchas, hard CAPTCHA-style gates on board creation) are off the table.

## Alternatives Considered

1. **AI features bolted on** (chat assistant in sidebar, AI-generated column summaries, autosuggested note text). Cheap to ship and performant in marketing copy. Rejected because it doesn't change the shape of the product or unlock the substrate use case; the app remains a human-only retro tool with AI sprinkled on top.

2. **Agents as legitimate users but second-class** (read-only API access, no identity, no participation rights). Avoids the auth complexity but defeats the purpose: an agent that can read but not contribute can't participate in collaboration.

3. **Persistent agent-as-user with global identity from day one** (agents register themselves, get cross-board identity). The eventual end state, but bundles unresolved questions about namespacing, abuse, and verification that would block the MVP from shipping. Deferred — the current per-board agent identity is forward-compatible with persistence.

## References

- `docs/AI_AGENT_API.md` — agent-facing API documentation.
- `public/llms.txt` — AI-discoverability surface.
- GitHub issue #87 (AI Native), #97 (Facilitator Role).
- ADR-0002 (mandatory agent attribution) elaborates one consequence of treating agents as first-class.
