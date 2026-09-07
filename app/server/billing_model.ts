// app/server/billing_model.ts
// Billing fields on the users table (GAP-005 / ADR-0013). Subscription state
// belongs to the account, not any crew — see the schema block in db_init.ts.
// All queries are raw parameterized SQL against `users`; no ORM.

import { pool } from "./db_config";

export interface BillingRow {
  userId: string;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
}

interface BillingSqlRow {
  id: string;
  email: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
}

function toBillingRow(row: BillingSqlRow): BillingRow {
  return {
    userId: row.id,
    email: row.email,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status,
  };
}

/** Billing fields for a registered user, or null if no such user. */
export async function getBillingForUser(userId: string): Promise<BillingRow | null> {
  const res = await pool.query<BillingSqlRow>(
    `SELECT id, email, stripe_customer_id, stripe_subscription_id, subscription_status
     FROM users WHERE id = $1`,
    [userId]
  );
  if (res.rowCount === 0) return null;
  return toBillingRow(res.rows[0]);
}

/** Records the Stripe customer created for this user. */
export async function setStripeCustomerId(userId: string, customerId: string): Promise<void> {
  await pool.query(
    `UPDATE users SET stripe_customer_id = $2 WHERE id = $1`,
    [userId, customerId]
  );
}

/**
 * Writes subscription state onto whichever user owns `customerId`. Returns
 * false when no user has that customer id (the webhook logs and moves on).
 */
export async function applySubscriptionState(
  customerId: string,
  subscriptionId: string | null,
  status: string
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE users
     SET stripe_subscription_id = $2, subscription_status = $3
     WHERE stripe_customer_id = $1`,
    [customerId, subscriptionId, status]
  );
  return (res.rowCount ?? 0) > 0;
}
