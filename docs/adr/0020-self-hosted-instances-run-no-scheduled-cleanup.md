# ADR-0020: Self-hosted instances run no scheduled cleanup

## Status

Accepted (2026-09-16) — amends [ADR-0016](0016-self-hosted-instances-are-tier-3.md) §5, which kept `CRON_SECRET` required and the ADR-0005 TTL in force on a self-hosted instance, and [ADR-0018](0018-every-setting-validated-and-database-tls.md) §1, which listed `CRON_SECRET` as required everywhere.

## Context

The stale-board archive (ADR-0005) runs only when something calls `/api/v1/cron/archive-stale` with `CRON_SECRET`. On the hosted service that caller is Vercel's cron, configured in `vercel.json`. Nothing in the app schedules it, so a self-hosted instance archived nothing unless its operator added a scheduler of their own — which the README asked them to do — and `CRON_SECRET` was required at startup whether they did or not.

ADR-0005's reason for the TTL is cost: an unbounded free tier makes the hosted service pay to keep every trial board forever. A self-hosted instance runs on the customer's own infrastructure, so that reason does not apply there.

## Decision

1. **A self-hosted instance does not archive boards.** Crewless boards there stay open until someone archives or deletes them.
2. **`CRON_SECRET` follows the Stripe variables.** It is required on the hosted service and refused at startup when `SELF_HOSTED=true`. On a self-hosted instance `cronSecret` is `null`.
3. **The cleanup endpoint returns 404 on a self-hosted instance,** whatever the method, before any credential is checked.

## Consequences

**Positive**
- A self-hosted operator has nothing to schedule and one fewer secret to manage.
- A `CRON_SECRET` set on a self-hosted instance cannot sit there unused: it stops startup, like the Stripe variables.

**Negative / load-bearing**
- Anonymous boards accumulate on a self-hosted instance indefinitely.
- Turning cleanup on for a self-hosted instance later needs its own scheduler — Vercel's cron does not exist there — not just a flag.

## Alternatives Considered

1. **Keep documenting a self-scheduled request.** Rejected. It asks every operator to wire up infrastructure for a job whose purpose, controlling the hosted service's storage cost, is not theirs.
2. **Run the job inside a self-hosted server.** Not adopted. Vercel is the only place the job needs to run.
