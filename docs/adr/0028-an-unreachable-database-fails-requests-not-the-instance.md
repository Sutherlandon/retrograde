# ADR-0028: An unreachable database fails requests, not the instance

## Status

Accepted (2026-11-04) — amends [ADR-0018](0018-every-setting-validated-and-database-tls.md) §4 and [ADR-0024](0024-queries-wait-for-the-schema-build.md). A misconfigured database still exits at startup; an unreachable one no longer does.

## Context

ADR-0018 §4 makes startup exit when it cannot reach the database, and ADR-0024 starts the schema build when `db_config.ts` loads. Both assume startup happens once, before traffic. On Vercel every cold start is a startup, and it runs inside the request that caused it.

Production showed what that costs. The first visitor to `retrograde.sh` after a quiet period got a 500. Neon had suspended the compute, the new instance's first connection kept being dropped while it woke (`Connection terminated unexpectedly`), the retries in `db_init.ts` ran out after about 4 seconds, and `process.exit(1)` took the instance down. On Vercel an exit fails every request on the instance, so the homepage failed. For an anonymous visitor the homepage never queries the database at all: the exit came from the build started at load, not from anything the page needed. A refresh landed on a new instance, by then with Neon awake, and worked.

An exit is the right answer to a database that will never work: wrong credentials, an unknown host, a certificate that does not verify. Restarting does not fix those, and a server that boots with them fails every request. A database that is waking, or a connection that dropped in transit, will work on the next attempt. Exiting for that throws away a healthy instance and fails requests that did not need it.

## Decision

1. **Two kinds of connect failure.** A failure `db_init.ts` classifies as transient (`ECONNRESET`, `ETIMEDOUT`, `EPIPE`, `EAI_AGAIN`, pg's "Connection terminated…", pg-pool's "timeout exceeded when trying to connect") is retried. Anything else — bad credentials, an unknown host, a TLS failure — exits at once with `FATAL: could not connect to the database`, as ADR-0018 §4 has it.
2. **Transient failures that outlast the retries reject; they do not exit.** The build rejects, `db_config.ts` forgets it, and every query that was waiting on it fails with the error. The next query starts a new build. The rejection of the build started at load is handled there, so Node does not exit on it.
3. **A connection that drops during the build is the same case.** The transaction is rolled back if the connection still allows it, the broken client is destroyed rather than returned to the pool, and the build rejects. A schema statement that fails on a healthy connection is a schema bug and still exits.
4. **Every connection attempt is bounded.** The pool sets `connectionTimeoutMillis: 5000`; without it, one attempt against a waking compute could hang until the function timed out. Retries back off at 250 ms, 500 ms, 1 s, 2 s and 4 s, six attempts at most, and stop once 15 seconds have passed since the first.
5. **The site pages do not need the database.** `SiteLayout`'s loader looks the visitor up for the header's account menu; if that lookup throws anything but a `Response`, it logs the error and renders the visitor signed out.

## Consequences

**Positive**
- A Neon cold start, or any brief loss of the database, no longer returns a 500 for pages that do not query, the homepage included.
- A cold start that recovers within the budget is invisible: the first request just waits for it.
- An instance that hits an unreachable database stays up and recovers on its own at the next query.

**Negative / load-bearing**
- A long-running server whose database is down at boot now starts and fails the requests that query, logging `[db] database unavailable after N attempts` for each build that gives up, instead of exiting. A process supervisor no longer sees a crash loop for that case. Misconfiguration still exits.
- A request that queries during a cold start can wait up to about 15 seconds before it fails.
- A signed-in visitor sees the site pages signed out while the database is unreachable.
- Whether an error is transient is decided by its code and message text. An unknown transient error exits the instance, as before; an unknown permanent one is not retried.

## Alternatives Considered

1. **Only lengthen the retries.** Rejected as the whole fix. It makes a cold start less likely to fail, but whenever the budget is spent the exit still fails requests that never touched the database.
2. **Stop starting the build at load, and build on the first query.** Not adopted. Pages that never query would no longer be affected, but it gives up ADR-0024's guarantee that a long-running server builds its schema before traffic, and does nothing for pages that do query.
3. **Keep the Neon compute from suspending.** A setting on the production branch, not a code change, and worth making: it removes the most common trigger. It is not a replacement. Connections still drop, and a self-hosted instance's database has its own outages.

## References

- `app/server/db_init.ts` (`connectWithRetry`, `initializeDatabase`), `app/server/db_config.ts` (`schemaPool`, `ensureSchema`), `app/components/SiteLayout.tsx`.
- ADR-0018 §4, ADR-0024.
