// app/config/grandfather.ts
// Free-tier ephemerality constants. See ADR-0005.

// Boards created before this timestamp are exempt from the free-tier TTL.
// Set to the date Teams + TTL shipped, so no existing user wakes up to find
// their boards auto-archived.
export const GRANDFATHER_CUTOFF = "2026-06-22T00:00:00Z";

// Days a teamless board lives before the auto-archive cron archives it.
export const FREE_TIER_TTL_DAYS = 30;
