import "server-only";

import type Stripe from "stripe";
import { requireCommerceEnv } from "@/config/commerce-env.server";

import {
  enqueuePaidEmail,
  processPaymentEvent,
} from "../repositories/commerce-repository";
import { stripeClient } from "../stripe/client";
import {
  stripeEventMatchesMode,
  stripeSessionMatchesMode,
} from "../stripe/mode";

const relevant = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
]);

export async function processVerifiedStripeEvent(event: Stripe.Event) {
  const mode = requireCommerceEnv().STRIPE_MODE;
  if (!stripeEventMatchesMode(event, mode))
    throw new Error("Stripe event mode mismatch");
  if (!relevant.has(event.type)) return "ignored";
  if (event.type === "payment_intent.payment_failed") {
    // A failed card attempt can still be retried inside an open Checkout Session.
    // Session expiry and async failure are the terminal release signals.
    const intent = event.data.object as Stripe.PaymentIntent;
    const sessions = await stripeClient().checkout.sessions.list({
      payment_intent: intent.id,
      limit: 1,
    });
    if (sessions.data.length === 0) return "unassociated";
    const current = await stripeClient().checkout.sessions.retrieve(
      sessions.data[0].id,
    );
    return processCurrentSession(current, event.id, event.type);
  }
  const incoming = event.data.object as Stripe.Checkout.Session;
  if (!stripeSessionMatchesMode(incoming, mode))
    throw new Error("Stripe session mode mismatch");
  // Fetch current state: webhook delivery order is not guaranteed.
  const current = await stripeClient().checkout.sessions.retrieve(incoming.id);
  return processCurrentSession(current, event.id, event.type);
}

export async function processCurrentSession(
  session: Stripe.Checkout.Session,
  eventId: string,
  eventType: string,
) {
  if (!stripeSessionMatchesMode(session, requireCommerceEnv().STRIPE_MODE))
    throw new Error("Stripe session mode mismatch");
  if (session.currency !== "eur" || session.mode !== "payment")
    throw new Error("Unexpected session currency or mode");
  const selectedCountry = session.metadata?.shipping_country;
  const actualCountry =
    session.collected_information?.shipping_details?.address.country;
  if (
    !selectedCountry ||
    (actualCountry && actualCountry !== selectedCountry)
  ) {
    throw new Error("Shipping country mismatch");
  }
  if (session.amount_total === null || session.status === null)
    throw new Error("Incomplete session");
  const result = await processPaymentEvent({
    eventId,
    eventType,
    sessionId: session.id,
    paymentStatus: session.payment_status,
    sessionStatus: session.status,
    amountTotal: session.amount_total,
    country: selectedCountry,
    paymentIntent:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    email: session.customer_details?.email ?? null,
    name: session.customer_details?.name ?? null,
  });
  if (session.payment_status === "paid" && session.status === "complete") {
    try {
      // Unique per-order outbox row; email availability cannot undo a paid order.
      await enqueuePaidEmail(session.id);
    } catch {
      console.error("Paid-order email enqueue unavailable");
    }
  }
  return result;
}
