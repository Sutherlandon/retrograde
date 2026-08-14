# Plans

Implementation plans — the working documents written *before* a significant feature or refactor, capturing the approach and its rationale so a new session can resume without re-deriving context. Required by rule 6 in `CLAUDE.md`.

## How plans relate to the other decision records

| Location | Horizon | Mutability |
|---|---|---|
| `docs/STATE.md` | Right now — what's where | Edit freely |
| `docs/plans/` | One feature or refactor | Edit while in flight; annotate once shipped |
| `docs/adr/` | Permanent — decisions that shape the architecture | Never edit an accepted ADR; supersede it |
| `docs/spec/` | Intended behavior, by actor | Edit as the product changes |

A plan says *how we're going to build this and why we chose that route*. When a plan produces a decision that is hard to reverse or that a future contributor might challenge without context, that decision graduates into an ADR — the plan stays as the working record, the ADR carries the commitment. Most of the ADRs below started life in one of these plans.

## Numbering

- **Filename:** `NNNN-kebab-case-title.md`, zero-padded to four digits, matching the `docs/adr/` and `docs/spec/` convention.
- **Sequential and immutable.** If you write 0007 and abandon it, the number is retired — do not reuse it. A gap in the sequence is meaningful information.
- **Order of creation, not of importance.** Numbers are assigned when the plan is written, so the sequence reads as a project history.
- **The number is not a dependency.** Plans may build on each other (0006 depends on 0005), but say so in the text; the numbers alone don't imply it.
- Keep the index below current when adding a plan.

## Status vocabulary

| Status | Meaning |
|---|---|
| **Draft** | Written, not agreed. Do not build from it. |
| **Accepted** | Agreed; implementation not started or in progress. |
| **Implemented** | Built. Note the branch — code on a feature branch has not reached `main`. |
| **Superseded** | Replaced by a later plan; link forward. |
| **Abandoned** | Not pursued. Keep the file and the number; record why. |

Put the status in a line directly under the title, with a date, so it is visible without reading the plan.

## Index

| # | Plan | Status | Related ADRs |
|---|---|---|---|
| [0001](0001-agent-collaboration-mvp.md) | Agent-Collaboration MVP — bulk-create boards from an API | **Implemented** · `agent-substrate` (946ca92), awaiting review | ADR-0001, ADR-0004 |
| [0002](0002-teams-api-keys-ephemerality.md) | Teams + API keys + free-tier ephemerality — the monetization foundation | **Implemented** · `agent-substrate` (946ca92), awaiting review. Billing itself deferred by design | ADR-0003, ADR-0004, ADR-0005 |
| [0003](0003-teams-facilitators-action-items.md) | Teams (#72) + facilitator role (#97) + action items (#88) | **Implemented** 2026-07-07 · `agent-substrate` (7a92705, 9cf8cb2), awaiting review. Carries the human-review punch list | ADR-0006 |
| [0004](0004-dashboard-team-view.md) | Dashboard as a team-level view + board→crew triage | **Implemented** 2026-07-17 · `agent-substrate` (a3d7265), awaiting review | ADR-0007, ADR-0008, ADR-0009 |
| [0005](0005-action-registry-audit.md) | Action registry — verifying the user feature map against the code | ⚠️ **Draft** 2026-08-11 — flagged as containing errors; refinement pending | — |
| [0006](0006-entitlements-and-agent-eval.md) | Membership entitlements + pre-launch correctness evidence | ⚠️ **Draft** 2026-08-11 — depends on 0005; same caveat | ADR-0003 (extends) |

**Branch note:** every implemented plan above sits on `agent-substrate`, four commits ahead of `main`. Nothing in 0001–0004 has shipped to production, and all four are pending human review.
