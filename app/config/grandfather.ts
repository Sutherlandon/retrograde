// app/config/grandfather.ts
// Free-tier ephemerality constants. See ADR-0005.

// Boards created before this timestamp are exempt from the free-tier TTL, so
// nothing that exists when the archive job first runs in production is ever
// archived (ADR-0019).
export const GRANDFATHER_CUTOFF = "2026-10-01T00:00:00Z";

// Days a teamless board lives before the auto-archive cron archives it.
export const FREE_TIER_TTL_DAYS = 30;
