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

/** Whether a crew's paid features are active. True for personal crews —
 *  tier 2 is free and never freezes — and for named crews whose OWNER
 *  has subscription_status = 'active'. The check is on the crew owner,
 *  not the acting user, because members are often free accounts. */
export async function crewIsEntitled(teamId: string): Promise<boolean> {
  const res = await pool.query<{ is_personal: boolean; subscription_status: string | null }>(
    `SELECT t.is_personal, u.subscription_status
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.role = 'owner'
     LEFT JOIN users u ON u.id = tm.user_id
     WHERE t.id = $1`,
    [teamId]
  );
  const row = res.rows[0];
  if (!row) return false;
  if (row.is_personal) return true;
  return row.subscription_status === "active";
}
