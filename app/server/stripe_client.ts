// app/server/stripe_client.ts
// The one place the Stripe SDK is instantiated. Never the deprecated
// global-key pattern (Stripe.setApiKey / Stripe(key)) — every caller imports
// this client instead of constructing its own. Null on a self-hosted
// instance, which has no Stripe key and no billing (ADR-0016); every billing
// route checks for that first and answers 404.
import Stripe from "stripe";
import { stripeRestrictedKey } from "./db_config";

export const stripe: Stripe | null = stripeRestrictedKey ? new Stripe(stripeRestrictedKey) : null;
