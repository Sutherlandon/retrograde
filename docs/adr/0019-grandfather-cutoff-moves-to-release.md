# ADR-0019: The grandfather cutoff moves to 1 October 2026

## Status

Accepted (2026-09-16) — amends the cutoff in [ADR-0005](0005-free-tier-ephemerality.md). The TTL policy there stands.

## Context

ADR-0005 exempts every board created before a grandfather cutoff from the free-tier TTL, so that no existing user wakes up to find their boards archived. The cutoff was set to `2026-06-22T00:00:00Z`, the date that ADR shipped.

The archive job never actually ran in production. Vercel invokes a cron path with a GET, and the route answered GET with 405 until commit `22e2610`. Every crewless board created since 22 June was therefore still open, and the first run after release would have archived all of those more than 30 days old at once — exactly what ADR-0005's cutoff exists to prevent.

## Decision

`GRANDFATHER_CUTOFF` is `2026-10-01T00:00:00Z`. The archive only touches crewless boards created on or after 1 October 2026; every board created before then is exempt permanently.

## Consequences

- Nothing that exists at release is archived. The earliest a board can be archived is 31 October 2026.
- The date is fixed in code and applies to every deployment. A self-hosted instance that upgrades after 1 October and schedules the job grandfathers boards created before that date, not before its own upgrade.

## Alternatives Considered

1. **Record the cutoff per deployment, the first time it boots this version.** Not adopted. It grandfathers exactly what each deployment had at upgrade, but a fixed date is simpler and covers the hosted service, which is the case that matters now.
