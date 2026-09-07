// app/server/entitlements.ts
// The entitlement seam: the single place that answers "is this account
// entitled to the paid tier?" Backed by Stripe subscription state on the
// users row (GAP-005 / ADR-0013) — an account is entitled iff its
// subscription_status is exactly "active". Every caller (CREW-002 in
// app/routes/app/crews.tsx, and anything gated on the same boundary later)
// keeps working without modification when billing rules change; only this
// function's body changes. See docs/plans/0006-close-the-tier-model.md for
// the tier model this seam implements.

import { pool } from "./db_config";

/**
 * Whether `userId` is entitled to create a named (tier-3, paid) crew.
 * CREW-002 in the action registry (docs/spec/0001-action-registry.md) is the
 * single gate for the paid tier — every other tier-3 action hangs off a
 * crew that isn't personal, so this one check is the whole boundary.
 */
export async function accountCanCreateNamedCrew(userId: string): Promise<boolean> {
  const res = await pool.query<{ subscription_status: string | null }>(
    `SELECT subscription_status FROM users WHERE id = $1`,
    [userId]
  );
  return res.rows[0]?.subscription_status === "active";
}
