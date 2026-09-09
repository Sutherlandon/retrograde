# ADR-0015: What happens when a subscription lapses

## Status

Accepted (2026-09-08) — extends [ADR-0011](0011-three-tiers-and-ownerless-anonymous-boards.md) §1 and [ADR-0013](0013-stripe-subscriptions.md). Neither is contradicted; both were silent on lapse.

## Context

ADR-0011 put the paid line at one action — creating a named crew — and ADR-0013 wired Stripe to it. Both stopped at the moment of purchase. Neither said what happens after someone stops paying.

The answer in the code was: nothing. `accountCanCreateNamedCrew` gated `crews.tsx`'s create action and nothing else. None of the eleven intents in `crews.$id.tsx` — rename, delete, add and remove member, members-only toggle, mint and revoke key, create board, and four action-item operations — consulted entitlement at all. So the paid tier could be bought once and kept forever: subscribe, create a crew, cancel, and every crew feature keeps working indefinitely. One month bought the product.

Closing that raises a question the create-time gate never had to answer: **whose subscription?** Crew members are frequently free accounts working inside a paying owner's crew. Gating on the acting user would freeze a free member who never owed anything, while leaving the owner's own lapse unpunished.

## Decision

### 1. Entitlement covers the whole crew surface, and it is checked against the crew's owner

A new predicate, `crewIsEntitled(teamId)` in `app/server/entitlements.ts`, resolves the crew's owner and reads that user's `subscription_status`. Every management and creation intent in `crews.$id.tsx` requires it. `accountCanCreateNamedCrew(userId)` still gates creation, because at creation time there is no crew to ask about yet.

The check is on the **owner, not the actor**. A free member of a paid crew works normally; every member of a lapsed crew is frozen alike. Entitlement is a property of the crew, inherited from whoever pays for it.

### 2. Personal crews never freeze

`crewIsEntitled` returns true unconditionally for `is_personal` crews. Tier 2 is free by definition (ADR-0011 §1), so a personal crew has no subscription to lapse. Nothing about this decision touches a free user's ordinary experience.

### 3. A lapse returns 402, not 403

Frozen intents throw `402 Payment Required`. The existing `403`s in that route mean "you are not the owner" — a permanent statement about identity. A lapse is a temporary statement about billing, and conflating the two makes the UI unable to tell a member they lack a role from an owner who needs to pay.

### 4. Named-crew API keys are revoked the moment the subscription lapses

`applySubscriptionState` — the webhook's only write path — revokes every active API key on the lapsed owner's **named** crews, in the same transaction as the status write. Personal-crew keys are untouched: one free key is a tier-2 entitlement (ADR-0011 §6).

This replaces the obvious alternative of leaving keys alive but blocking the revoke button. An agent key is a live credential; freezing the *ability to revoke* it would mean a lapsed customer with a leaked key has to pay before they can secure their own account. Revoking on lapse removes the hostage entirely — there is nothing left to revoke.

### 5. Members keep access to existing boards, and members-only stays enforced

A lapse freezes *new* work: no new boards into the crew, no new or edited crew action items. It does not revoke access to what already exists, and it does **not** relax `restrict_board_access`.

That second point is deliberate and load-bearing. The intuitive reading of "paid features stop working" would turn members-only boards back into anyone-with-the-link boards — which means an expired card silently publishes a team's private retrospectives. Lapse fails **closed**. A billing state change must never widen access.

### 6. Checking off an existing action item is not frozen

`toggleItem` is the one intent left open. Ticking a checkbox on work that already exists is not new work, and blocking it would produce a crew whose members can read a follow-up list but not mark it done. Every other action-item operation — add, edit, delete — is frozen.

## Consequences

**Positive**
- The leak is closed: the paid tier cannot be bought once and kept. Cancelling stops the crew being productive within one webhook round-trip.
- Nothing is deleted and nothing is exposed. A lapsed crew is inert, not gone, so resubscribing restores it exactly.
- The owner-not-actor rule means free members are never punished for someone else's billing, and never shielded from it either.

**Negative / load-bearing**
- **A lapsed owner cannot remove a member or delete their own crew.** Both are frozen, by explicit decision. The consequence is real: an owner whose card expires cannot revoke a departing colleague's access until they pay. The counter-argument — that these are exit and security actions and should stay open — was made and rejected in favour of a single rule with no exceptions to explain. Key revocation, the sharpest instance of that concern, is answered by §4 instead. **This is the first thing to revisit if it generates support load.**
- **Members can be frozen by someone else's inaction, with no way to fix it and no notification.** The UI tells them the crew needs a subscription; it does not tell the owner their crew has gone quiet. A dunning email is Stripe's to send; an in-app nudge to the owner is not built.
- A crew frozen mid-retrospective stops accepting new boards while a meeting is happening. Boards already open keep working, so an in-progress session survives; the next one does not start.
- `crewIsEntitled` adds a query to eleven mutation paths. Each is a single indexed join and these are not hot paths, but it is a real cost that did not exist before.

## Alternatives Considered

1. **Gate on the acting user rather than the crew owner.** Rejected: it freezes free members who owe nothing while leaving the actual subscriber's lapse unenforced — precisely backwards.
2. **Freeze management but let members keep working normally.** Rejected as too weak: the crew keeps delivering nearly all its value, so cancelling costs almost nothing and the leak stays open in substance.
3. **Freeze everything, including reading and using existing boards.** Rejected: it breaks live retrospectives for members who did not cancel, cannot fix it, and may not know it happened. The pressure is not worth the collateral.
4. **Drop `restrict_board_access` on lapse, as "the paid feature turning off."** Rejected outright: it converts a billing event into a data-exposure event. See §5.
5. **Leave keys alive and merely block minting.** Rejected: see §4 — it makes securing a leaked credential a paid feature.
6. **Delete or archive lapsed crews after a grace period.** Not adopted now. It may be necessary eventually for storage, but destroying customer data over billing needs its own decision, notification, and recovery window.

## References

- ADR-0011 §1 (the paid line and the entitlement seam), §6 (one free key on the personal crew); ADR-0013 (Stripe integration, the webhook as sole writer); ADR-0010 (`restrict_board_access`).
- `app/server/entitlements.ts` (`crewIsEntitled`), `app/server/billing_model.ts` (`applySubscriptionState`), `app/server/api_key.ts` (`revokeNamedCrewKeysForOwner`), `app/routes/app/crews.$id.tsx`.
- `docs/spec/0001-action-registry.md` — CREW-004 through CREW-017.
