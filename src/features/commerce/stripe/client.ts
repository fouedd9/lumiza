import "server-only";

import Stripe from "stripe";

import { requireCommerceEnv } from "@/config/commerce-env.server";

let instance: Stripe | undefined;
let instanceKey: string | undefined;

export function stripeClient() {
  const key = requireCommerceEnv().STRIPE_SECRET_KEY;
  if (!instance || instanceKey !== key) {
    instance = new Stripe(key, { maxNetworkRetries: 1, timeout: 15_000 });
    instanceKey = key;
  }
  return instance;
}

export function isDefinitiveStripeFailure(error: unknown) {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError ||
    error instanceof Stripe.errors.StripeAuthenticationError ||
    error instanceof Stripe.errors.StripePermissionError
  );
}
