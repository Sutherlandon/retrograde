// app/routes/app/billing.checkout.ts
// CREW-002's on-ramp to the paid tier (ADR-0013 / GAP-005). Resource route,
// action only: finds or creates the caller's Stripe customer, then redirects
// to a Stripe-hosted Checkout Session for the one recurring Price. Actual
// entitlement flips on later, via the webhook (routes/api/stripe.webhook.ts)
// writing subscription_status — never on this route's success path.

import { randomInt } from "node:crypto";
import { redirect, type ActionFunctionArgs } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { getBillingForUser, setStripeCustomerId } from "~/server/billing_model";
import { stripe } from "~/server/stripe_client";
import { stripePriceId } from "~/server/db_config";

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function randomLetters(n: number): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < n; i++) {
    out += letters[randomInt(letters.length)];
  }
  return out;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return err("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  const user = await requireRegisteredUser(request);
  const billing = await getBillingForUser(user.id);

  // Never double-subscribe — an already-active subscription just goes back
  // to the crews page instead of opening a second Checkout Session.
  if (billing?.subscriptionStatus === "active") {
    return redirect("/app/crews");
  }

  let customerId = billing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: billing?.email ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await setStripeCustomerId(user.id, customerId);
  }

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${origin}/app/crews?checkout=success`,
    cancel_url: `${origin}/app/crews`,
    // No payment_method_types — Stripe decides eligible methods dynamically
    // from Dashboard settings; hardcoding this is the first mistake Stripe's
    // own guidance flags.
    integration_identifier: `retrograde_${randomLetters(8)}`,
    // Stripe is merchant of record on this sale (ADR-0014): Stripe, not us,
    // calculates and remits sales tax/VAT/GST across its 80+ supported
    // countries. Do not also set automatic_tax, tax_id_collection, or any
    // other param on Stripe's forbidden-with-managed_payments list — those
    // conflict with Stripe owning tax end to end.
    managed_payments: { enabled: true },
  });

  return redirect(session.url!);
}

export function loader() {
  return err("METHOD_NOT_ALLOWED", "Use POST", 405);
}
