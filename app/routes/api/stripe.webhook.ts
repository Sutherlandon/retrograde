// app/routes/api/stripe.webhook.ts
// The only route Stripe talks back to. Verifies the webhook signature against
// the raw request body, then applies subscription state changes (renewals,
// failed payments, cancellations) that happen asynchronously after checkout
// and are otherwise invisible to the app. See docs/adr/0013 (Stripe
// subscriptions) and CREW-002 in docs/spec/0001-action-registry.md.
//
// Always returns 200 for a verified event, handled or not — Stripe retries
// any non-2xx response, and an unhandled-but-valid event must not cause
// retries. Only a missing/invalid signature is rejected with 400.

import type { ActionFunctionArgs } from "react-router";
import type Stripe from "stripe";
import { stripe } from "~/server/stripe_client";
import { stripeWebhookSecret } from "~/server/db_config";
import { applySubscriptionState } from "~/server/billing_model";

function err(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

// Stripe fields that reference another object can arrive as a bare id string
// or as an expanded object — normalize to the id.
function idOf(x: string | { id: string } | null | undefined): string | null {
  if (!x) return null;
  return typeof x === "string" ? x : x.id;
}

// The invoice -> subscription id field moved between Stripe API versions.
// The installed SDK (stripe@22.6.1, API version 2026-07-29.dahlia-era types)
// has no top-level `subscription` field on the Invoice response object at
// all — it only exists nested under `parent.subscription_details.subscription`.
function subscriptionIdOfInvoice(inv: Stripe.Invoice): string | null {
  return idOf(inv.parent?.subscription_details?.subscription ?? null);
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === "subscription" && s.payment_status === "paid") {
        await applyAndWarn(event.type, idOf(s.customer), idOf(s.subscription), "active");
      }
      return;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await applyAndWarn(event.type, idOf(sub.customer), sub.id, sub.status);
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await applyAndWarn(event.type, idOf(sub.customer), sub.id, "canceled");
      return;
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      await applyAndWarn(event.type, idOf(inv.customer), subscriptionIdOfInvoice(inv), "active");
      return;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      await applyAndWarn(event.type, idOf(inv.customer), subscriptionIdOfInvoice(inv), "past_due");
      return;
    }
    default:
      return;
  }
}

async function applyAndWarn(
  eventType: string,
  customerId: string | null,
  subscriptionId: string | null,
  status: string,
): Promise<void> {
  if (!customerId) {
    console.warn(`stripe webhook ${eventType}: no customer id on event`);
    return;
  }
  const applied = await applySubscriptionState(customerId, subscriptionId, status);
  if (!applied) {
    console.warn(`stripe webhook ${eventType}: no user owns customer ${customerId}`);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return err("METHOD_NOT_ALLOWED", "Use POST", 405);
  }

  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return err("MISSING_SIGNATURE", "Missing stripe-signature header", 400);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, stripeWebhookSecret);
  } catch {
    return err("INVALID_SIGNATURE", "Webhook signature verification failed", 400);
  }

  await handleEvent(event);
  return Response.json({ received: true }, { status: 200 });
}

export function loader() {
  return err("METHOD_NOT_ALLOWED", "Use POST", 405);
}
