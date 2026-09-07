// app/server/stripe_client.ts
// The one place the Stripe SDK is instantiated. Never the deprecated
// global-key pattern (Stripe.setApiKey / Stripe(key)) — every caller imports
// this client instead of constructing its own.
import Stripe from "stripe";
import { stripeRestrictedKey } from "./db_config";

export const stripe = new Stripe(stripeRestrictedKey);
