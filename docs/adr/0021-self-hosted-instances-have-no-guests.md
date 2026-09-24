# ADR-0021: A self-hosted instance has no guests

## Status

Accepted (2026-09-16) — amends [ADR-0016](0016-self-hosted-instances-are-tier-3.md) §5, which left tier 1 unchanged on a self-hosted instance. ADR-0011's tier 1 stands on the hosted service.

## Context

On the hosted service anyone with a board's link can take part without an account — tier 1 (ADR-0011). Three paths create that participation: the board layout creates an anonymous user for a visitor with no session, the homepage form creates a crewless board, and `POST /api/v1/boards` without credentials mints an anonymous agent and hands back a legacy `agent_token`.

A self-hosted instance serves one organization behind its own identity provider. There, anonymous participation is a way around sign-in, not a feature.

## Decision

### 1. Every request needs a signed-in account, or an API key for the JSON API

The only exceptions are sign-in itself (`/auth/login`, `/auth/callback`, `/auth/logout`) and `/healthcheck`. A page request without an account is sent to sign in and brought back afterwards. A JSON API request gets `401`.

### 2. It is enforced in the identity helpers, not route by route

`getOptionalUser`, `getApiUser` and `getOrCreateUser` — and the board permission guards built on them — throw when `SELF_HOSTED=true` and the caller has no signed-in account, instead of returning or creating a guest. An anonymous session left in a browser from before an upgrade counts as signed out.

### 3. API keys still work; legacy agent tokens do not

A key is minted by a signed-in crew owner, so an agent using one is acting for an account. A legacy `agent_token` belongs to an anonymous trial agent, and is refused.

### 4. The homepage board form does not exist

Its action redirects to `/app/dashboard` and creates nothing, even for a signed-in user, matching the marketing site it belongs to (ADR-0017).

### 5. After sign-in, people return to a page the instance serves

A background `.data` request returns to its page rather than its data URL, and a marketing page returns to the dashboard.

### 6. A coverage test is the tripwire

Every route module must call one of the gated helpers, or be listed as public with the reason it is safe.

## Consequences

**Positive**
- No request creates a guest user or an anonymous board on a self-hosted instance. The hosted service is unchanged.
- A new route inherits the rule by resolving its caller the normal way, and the coverage test catches one that does not.

**Negative / load-bearing**
- The coverage test checks that a route calls a gated helper by name, not that it does so before anything else. The board route resolves its caller before the example-board shortcut for exactly this reason, and a new route must too.
- Crewless boards created before an upgrade still open for any signed-in user who has the link.

## Alternatives Considered

1. **React Router middleware on the root route.** Not adopted. It needs the global `future.v8_middleware` flag, and with that flag on React Router answers every request with a `500` if the platform passes a load context that is not a `RouterContextProvider`. Whether Vercel's zero-config handler does cannot be verified from the repository, and the hosted service should not take that risk for a self-hosted rule.
2. **A check at the top of every route.** Rejected. Two dozen call sites, and the next route would have to remember.

## References

- ADR-0011 (tiers), ADR-0016 (self-hosted instances), ADR-0017 (no marketing site).
- `app/hooks/useAuth.ts`, `app/routes/site/home.tsx`, `app/routes/app/board.tsx`, `app/server/self_hosted_sign_in_coverage.test.ts`.
- `docs/spec/0001-action-registry.md` — SITE-003, AUTH-004, BRD-017, API-002.
