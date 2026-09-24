# Plans

Working documents for a feature or refactor that hasn't landed yet: the approach, the rationale, and what "done" means. Required by rule 6 in `CLAUDE.md`.

## Plans are disposable

A plan exists to carry work from "decided" to "built." When the work merges, the plan has done its job and is **deleted**. Anything durable in it graduates first:

| Durable thing | Where it goes |
|---|---|
| A decision that shapes the architecture | `docs/adr/` |
| What the product does, action by action | `docs/spec/0001-action-registry.md` |
| Current state, gaps, gotchas | `docs/STATE.md` |
| What it does for API consumers | `docs/AI_AGENT_API.md` |

Keeping shipped plans around produces an archive of how we got here, which nobody reads and which quietly contradicts the docs that are current. Git already has the history. What matters is where the project is and why it is that way.

## The other decision records

| Location | Horizon | Mutability |
|---|---|---|
| `docs/STATE.md` | Right now — what's where, what's broken | Edit freely |
| `docs/spec/` | What the product does, complete | Edit as the product changes |
| `docs/plans/` | One unfinished feature or refactor | Edit while in flight; delete when it lands |
| `docs/adr/` | Permanent — decisions that shape the architecture | Never edit an accepted ADR; supersede it |

## Conventions

- **Filename:** `NNNN-kebab-case-title.md`, zero-padded to four digits, matching `docs/adr/` and `docs/spec/`.
- **Numbers are not reused.** Deleting a shipped plan retires its number. Gaps in the sequence are expected and mean nothing.
- **Status line** directly under the title, with a date: **Draft** (not agreed — do not build from it) or **Accepted** (agreed; build it).
- **The number is not a dependency.** If a plan builds on another, say so in the text.

## Open plans

| # | Plan | Status |
|---|---|---|

Plans 0001–0006 shipped and have been deleted. Their decisions live in ADRs 0001–0011 and the action registry. There is no open plan.
