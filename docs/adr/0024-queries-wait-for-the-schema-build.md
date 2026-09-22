# ADR-0024: Every query waits for the schema build

## Status

Accepted (2026-09-21) — refines how [ADR-0018](0018-every-setting-validated-and-database-tls.md) §3's startup database check runs. The check itself is unchanged.

## Context

The schema is built by `initializeDatabase()` in `db_init.ts`: idempotent DDL in one transaction, run on every boot, with no migration tool. It was started as a side effect of importing the module, and nothing waited for it.

On a long-running server that was harmless, because the build finished long before real traffic arrived. On Vercel it is not. A function is frozen as soon as it sends a response, so a build started during a request that never touched the database could sit mid-transaction for as long as the instance lived, and nothing it created is visible until it commits. The first deploy against an empty database proved it: `relation "users" does not exist` on every request that queried, indefinitely. Production had never shown it only because its tables already existed. The same race would have left any new schema block, including 2.0's, unapplied there.

## Decision

1. **`db_config.ts` owns the build.** It starts `initializeDatabase()` once, when it loads, so a long-running server still exits at startup when the database is unreachable (ADR-0018).
2. **`pool.query` and `pool.connect` await it.** No request can query ahead of the schema, and a request that queries keeps the function alive until the build commits.
3. **The build uses its own ungated pool, `schemaPool`,** which nothing else touches, so it can never wait on itself.
4. **`db_init.ts` has no import-time side effect.** A test fails if one comes back.

## Consequences

**Positive**
- An empty database builds itself on the first deploy, on Vercel as elsewhere.
- Schema changes land before the first query that depends on them.

**Negative / load-bearing**
- The first query on a cold instance waits for the whole DDL pass. It is idempotent and quick on an existing database, but it is latency on every cold start.
- A request that never queries can still respond before the build commits. That is harmless: the build carries on in the next invocation, and every query waits for it.
- `pool` exposes only `query` and `connect`. Anything else needed from pg's `Pool` has to be added to the gate deliberately.

## Alternatives Considered

1. **React Router middleware awaiting the build.** Rejected for the reason ADR-0021 gives: the middleware flag changes the load-context contract, with a 500 on every request when it is wrong, on a platform we cannot test locally.
2. **Awaiting the build in each loader.** Rejected: one forgotten call brings the race back.
3. **A migration step in the build or deploy.** Not adopted: the project runs schema at boot on purpose (no migration tool), and a self-hosted instance has no deploy step to hook.

## References

- `app/server/db_config.ts` (`pool`, `schemaPool`, `ensureSchema`), `app/server/db_init.ts`.
- ADR-0018 (startup validation and the database connection), ADR-0021 (why not middleware).
