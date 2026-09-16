# ADR-0017: Deployment is configured by environment variables, not code

## Status

Accepted (2026-09-14) — extends [ADR-0016](0016-self-hosted-instances-are-tier-3.md): a self-hosted instance also makes the dashboard home. Removes `app/config/siteConfig.ts`.

## Context

ADR-0016 introduced `SELF_HOSTED`. Everything else that varied by deployment still lived in `app/config/siteConfig.ts` as source constants: `dashboardHome`, the OIDC `usernameField`, and logo imports. A deployment configured them by editing that file. The self-hosted customer's logo SVGs sit gitignored in `app/config/`, wired in by uncommenting imports.

Every such edit is a patch the customer re-applies on every upgrade, and a constant cannot differ between deployments without a rebuild. `dashboardHome` also bundled two unrelated facts: that the dashboard is home, which is true of a self-hosted instance, and that logout is hidden, which is true of an identity provider that signs users straight back in.

## Decision

### 1. Anything that varies by deployment is an environment variable

It is read once in `app/server/db_config.ts` and validated at startup (CLAUDE.md rule 5). `siteConfig.ts` is deleted. A deployment is configured through its environment; nobody edits source.

### 2. `SELF_HOSTED=true` makes the dashboard home

The `SiteLayout` loader redirects to `/app/dashboard`. Every marketing page — home, about, contact, terms, privacy — is a child of that layout, so one redirect covers all of them, and a test pins that parentage so a new page cannot slip outside it. `/sitemap.xml` returns 404, and the header drops its About and Contact links.

### 3. Logout visibility is its own switch: `HIDE_LOGOUT`

Whether a logout button makes sense depends on the identity provider, not on how the instance is licensed, so `SELF_HOSTED` does not imply it. It is parsed as strictly as `SELF_HOSTED`: any value but `true` or `false` refuses to boot.

### 4. The username claim and the logo are environment variables

- `OAUTH_USERNAME_FIELD` names the stored profile field shown as the username: `preferred_username` (the default), `email`, `name`, `given_name` or `family_name`. Those are the only profile fields the OAuth callback stores, so any other value refuses to boot instead of showing everyone as "Guest".
- `SITE_LOGO_LIGHT_URL`, `SITE_LOGO_DARK_URL` and `SITE_LOGO_ALT` are all-or-nothing. A partial set refuses to boot and names what is missing. They are URLs, not bundled imports: `react-router-serve` serves `build/client` at `/`, so a file placed there, such as `/branding/logo-light.svg`, is served with no rebuild.

### 5. The browser receives these values through layout loaders

`process.env` does not exist on the client. `db_config.ts` exports `hostingConfig` (`selfHosted`, `hideLogout`, `siteLogo`). The site, app and board layout loaders return it, and `Header` takes it as a **required** `hosting` prop, so a layout that forgets it fails typecheck instead of rendering dead links.

### 6. The logout redirect and Vercel Analytics follow the same rule

- `OAUTH_LOGOUT_REDIRECT_URL` — an `http(s)` URL or a path on the instance, default `/` — is read and validated in `db_config.ts`, and `logout.ts` redirects to it. A protocol-relative value is refused, because a browser treats `//host` as another site.
- Vercel Analytics loads only on the hosted service. The root loader returns `vercelAnalytics: !selfHosted`, and the root layout renders `<Analytics />` only when that is true, so a self-hosted instance never requests Vercel's script. With no root data — the root loader never ran — it is not rendered either.

### 7. `README.md` is the operator's guide

Self-hosting is documented at the top level of the repository, for the people who run an instance rather than those who change the code: what to provision, every environment variable, how to run and upgrade, and the `FATAL:` messages startup can print.

## Consequences

**Positive**
- A self-hosted customer upgrades by replacing the build. Their configuration lives in their environment, so nothing has to be re-applied.
- A misconfigured value fails at startup with a message naming the variable.
- `SELF_HOSTED` is the one switch for a self-hosted instance: every account tier 3, no billing, no marketing site.

**Negative / load-bearing**
- **A deployment that relied on `dashboardHome` to hide logout must now set `HIDE_LOGOUT=true`**, or it shows a logout button that signs users straight back in.
- **A deployment that sets `LOGOUT_REDIRECT_URL` must rename it to `OAUTH_LOGOUT_REDIRECT_URL`.** The old name is not read.
- A logo is a URL the browser fetches, not an asset in the bundle, so it must be reachable from users' browsers.
- Every new deployment-dependent setting has to follow the same path: `db_config.ts`, startup validation, and a loader prop if the browser needs it. Environment variables are the mechanism for now; if the settings multiply, a config file or an admin UI may replace them.

## Alternatives Considered

1. **Keep `siteConfig.ts` and read `process.env` inside it.** Rejected. Client components import it, and `process.env` does not exist in the browser, so the module would resolve differently on server and client.
2. **Derive `HIDE_LOGOUT` from `SELF_HOSTED`.** Rejected. A self-hosted instance without auto-signing SSO would lose logout, and a hosted SSO deployment could not hide it.
3. **A root loader read through `useRouteLoaderData`.** Not adopted. The layouts already pass deployment flags such as `isAdmin` and `isSubscribed` as props, and explicit props keep `Header` renderable in tests without a data router.

## References

- ADR-0016 (self-hosted instances); CLAUDE.md rule 5.
- `app/server/db_config.ts` (`parseBooleanEnv`, `hideLogout`, `oauthUsernameField`, `siteLogo`, `hostingConfig`), `app/components/SiteLayout.tsx`, `app/components/AppLayout.tsx`, `app/components/BoardLayout.tsx`, `app/components/Header.tsx`, `app/components/AccountHub.tsx`, `app/routes/sitemap.ts`, `app/hooks/useAuth.ts`, `app/routes/auth/logout.ts`, `app/root.tsx`, `README.md`.
- `docs/spec/0001-action-registry.md` — SITE-001, SITE-002, SITE-005, AUTH-003.
