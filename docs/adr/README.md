# Architecture Decision Records (ADRs)

This folder records the decisions that shape retrograde's architecture and product direction. When a future contributor — human or AI agent — picks up this project, the ADRs explain *why* things are the way they are, not just *what* the code does.

ADRs are the long-memory counterpart to `docs/STATE.md` (the short-term snapshot of current state).

## When to write an ADR

Write an ADR when at least one of these is true:

- The decision is hard to reverse without significant cost.
- The decision shapes how future features should be designed.
- The decision involves a real tradeoff where the rejected alternatives are non-obvious.
- The decision is one a future contributor might want to challenge without realizing the context behind it.

Don't write an ADR for:

- Implementation details — use code comments.
- Current project state or progress — use `docs/STATE.md`.
- Bug fixes — the commit message is the record.
- Naming or formatting style — use `CLAUDE.md` or a code style doc.

## Convention

- **Filename:** `NNNN-kebab-case-title.md` where `NNNN` is a zero-padded 4-digit number.
- **Numbering is sequential and immutable.** If you write 0007 and decide not to merge it, leave the number retired rather than reusing it.
- **Structure:** every ADR has **Status**, **Context**, **Decision**, **Consequences**. Optionally **Alternatives Considered** and **References**.
- **Status values:** `Proposed` | `Accepted` | `Deprecated` | `Superseded by ADR-NNNN`.
- **Never edit an accepted ADR's substance.** If the decision changes, write a new ADR that supersedes it and update the old one's status to point at the new one. The old reasoning stays in the historical record.
- **Date Accepted-status decisions** (one line under Status).

## Index

- [ADR-0001: Agents as first-class citizens](0001-agents-as-first-class-citizens.md) — strategic positioning
- [ADR-0002: Mandatory agent attribution](0002-mandatory-agent-attribution.md) — agent-authored notes are always attributed, even when the human-attribution toggle is off
- [ADR-0003: Teams as billing + auth unit](0003-teams-as-billing-unit.md) — every registered user has a personal team; teams own boards and API keys
- [ADR-0004: API keys for agent authentication](0004-api-keys-for-agent-auth.md) — `rk_live_…` keys, team-scoped, hashed at rest, revocable; legacy bearer-as-session-cookie stays for backward compat
- [ADR-0005: Free-tier ephemerality](0005-free-tier-ephemerality.md) — teamless boards auto-archive after 30 days; existing accounts and team boards exempt
- [ADR-0006: Board facilitation + action items](0006-board-facilitation-and-action-items.md) — facilitator role on board_members, open_facilitation mode, action_items as first-class board/team records
- [ADR-0007: Crew page absorbs the dashboard's per-crew filter (GitLab-lite)](0007-crew-page-gitlab-lite.md) — one refined crew page reusing dashboard components; `/app/teams` renamed to `/app/crews` with no back-compat
- [ADR-0008: API keys are AI crew members](0008-api-keys-are-ai-crew-members.md) — key management moves onto the crew page as an "AI Crew" section; standalone account page retired
- [ADR-0009: Remove the team auto-claim backfill](0009-remove-team-auto-claim-backfill.md) — startup backfill silently re-attached teamless boards on every restart; removed, plus a one-time pre-launch reset to Unassigned
- [ADR-0010: Crew boards are members-only by default](0010-members-only-crew-boards.md) — named crews restrict board access to members (personal crews stay open); enforced server-side via a single `getBoardAccess` guard
- [ADR-0011: Three tiers, ownerless anonymous boards, and where the paid line sits](0011-three-tiers-and-ownerless-anonymous-boards.md) — tiers 1 Anonymous / 2 Registered / 3 Paid with the boundary at `is_personal`; creating a named crew is the single payment gate via an entitlement seam; anonymous boards have no owner and are always openly facilitated; one free API key; facilitator is the primitive; locks and facilitator controls enforced server-side; the registry is the spec and a linkage test keeps it honest
- [ADR-0012: Claiming a board assigns it to the claimer's personal crew](0012-claiming-assigns-the-personal-crew.md) — amends ADR-0011 §5; claiming makes a board permanent (the TTL only touches crewless boards) and gives it a home, without changing `open_facilitation` and so without seizing a live retro
- [ADR-0013: Stripe subscriptions behind the entitlement seam](0013-stripe-subscriptions.md) — one Product / one monthly Price / no trial; subscription state on `users` in Stripe's own status strings; hosted Checkout + Billing Portal, no Stripe.js; the webhook is the source of truth and handles the full lifecycle; restricted key, and every required env var now fails startup via `requireEnv()`
- [ADR-0014: Stripe is the merchant of record (Managed Payments)](0014-stripe-is-merchant-of-record.md) — amends ADR-0013's deferred tax decision; Stripe becomes the legal seller and remits tax in 80+ countries for 3.5%, so no registrations or filings, and `automatic_tax` must never be set
- [ADR-0015: What happens when a subscription lapses](0015-what-happens-when-a-subscription-lapses.md) — entitlement covers the whole crew surface and is checked against the crew *owner*, not the actor; personal crews never freeze; lapse returns 402, revokes named-crew API keys, freezes new work, and deliberately fails **closed** on members-only access
- [ADR-0016: Self-hosted instances are tier 3 for every account](0016-self-hosted-instances-are-tier-3.md) — `SELF_HOSTED=true` makes the entitlement seam return true for everyone; billing does not exist there (Stripe vars not required and refused if set, billing routes 404, no Billing link); strict parsing and a conflict guard make both misconfigurations fail at startup; narrows ADR-0013 §5
- [ADR-0017: Deployment is configured by environment variables, not code](0017-deployment-configured-by-environment.md) — `app/config/siteConfig.ts` deleted; `SELF_HOSTED` also makes the dashboard home (site pages redirect, sitemap 404, no About/Contact); `HIDE_LOGOUT`, `OAUTH_USERNAME_FIELD` and all-or-nothing `SITE_LOGO_*` URLs replace source edits; the browser gets `hostingConfig` through a required `hosting` prop from each layout loader; `OAUTH_LOGOUT_REDIRECT_URL` replaces the unread `LOGOUT_REDIRECT_URL`; Vercel Analytics loads only on the hosted service; `README.md` is the self-hosting guide
- [ADR-0018: Every setting is validated at startup, and the database uses TLS outside local development](0018-every-setting-validated-and-database-tls.md) — every env var is read in `db_config.ts`: required ones exit when missing, optional ones when malformed (`SESSION_SECRET`, OAuth, database, `SITE_ADMIN_IDS`, `NODE_ENV`, `PORT`); the pool uses `ssl: { rejectUnauthorized: true }` unless `NODE_ENV=development`, and `sslmode=disable`/`ssl=false` are refused there; startup exits if it cannot connect
- [ADR-0019: The grandfather cutoff moves to 1 October 2026](0019-grandfather-cutoff-moves-to-release.md) — amends ADR-0005; the archive job never ran against the original 2026-06-22 date, so it would have archived months of existing boards at once; a fixed date, which only matters on the hosted service
- [ADR-0020: Self-hosted instances run no scheduled cleanup](0020-self-hosted-instances-run-no-scheduled-cleanup.md) — amends ADR-0016 §5 and ADR-0018; the TTL exists for the hosted service's storage cost, so a self-hosted instance never archives boards; `CRON_SECRET` is required on the hosted service and refused when `SELF_HOSTED=true`; the cleanup endpoint returns 404 there
- [ADR-0021: A self-hosted instance has no guests](0021-self-hosted-instances-have-no-guests.md) — amends ADR-0016 §5; every request needs a signed-in account, or an API key for the JSON API; enforced in the identity helpers (`getOptionalUser`, `getApiUser`, `getOrCreateUser`), not React Router middleware, whose global flag risks a 500 on every hosted request; legacy agent tokens refused; homepage form disabled; a coverage test checks every route
- [ADR-0022: A board is anonymous when it has no owner, not when it has no crew](0022-anonymous-means-ownerless.md) — amends ADR-0011 §4; every pre-2.0 board is crewless with a registered owner, so Crew Access, the open-facilitation guard and block 32 now key on the owner row; owned crewless boards get the full Crew Access controls; moving a board never changes `open_facilitation`
