// app/server/entitlements.ts
// The entitlement seam: the single place that answers "is this account
// entitled to the paid tier?" Retrograde has no billing provider yet, so
// this returns true unconditionally today. When billing lands (Stripe or
// similar), only this function's body changes — every caller (CREW-002 in
// app/routes/app/crews.tsx, and anything gated on the same boundary later)
// keeps working without modification. See GitHub issue #59 and
// docs/plans/0006-close-the-tier-model.md for the tier model this seam
// implements.

/**
 * Whether `userId` is entitled to create a named (tier-3, paid) crew.
 * CREW-002 in the action registry (docs/spec/0001-action-registry.md) is the
 * single gate for the paid tier — every other tier-3 action hangs off a
 * crew that isn't personal, so this one check is the whole boundary.
 */
export async function accountCanCreateNamedCrew(userId: string): Promise<boolean> {
  // No billing provider exists yet — everyone is entitled for now.
  void userId;
  return true;
}
