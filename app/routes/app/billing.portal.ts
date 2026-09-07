// app/routes/app/billing.portal.ts
// "Manage billing" (CREW-002 / ADR-0013): hands off to the Stripe-hosted
// Billing Portal, where cancel / payment-method changes actually live.
// Nothing about subscription management is built by hand here.

import { redirect, type ActionFunctionArgs } from "react-router";
import { requireRegisteredUser } from "~/hooks/useAuth";
import { getBillingForUser } from "~/server/billing_model";
import { stripe } from "~/server/stripe_client";

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return err("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  const user = await requireRegisteredUser(request);
  const billing = await getBillingForUser(user.id);

  if (!billing?.stripeCustomerId) {
    return redirect("/app/crews");
  }

  const origin = new URL(request.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripeCustomerId,
    return_url: `${origin}/app/crews`,
  });

  return redirect(session.url!);
}

export function loader() {
  return err("METHOD_NOT_ALLOWED", "Use POST", 405);
}
