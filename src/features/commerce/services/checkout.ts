import "server-only";

import frMessages from "@/../messages/fr.json";
import enMessages from "@/../messages/en.json";
import deMessages from "@/../messages/de.json";

import { requireCommerceEnv } from "@/config/commerce-env.server";
import { lumizaProduct } from "@/features/product/data/product";

import { quoteCart, shippingCents } from "../domain/pricing";
import { cartSchema, FINISHES } from "../schemas/cart";
import {
  packsFromSnapshots,
  snapshotsMatchQuote,
} from "../domain/catalog-guard";
import { ORDER_STATES } from "../domain/states";
import {
  attachSession,
  failSession,
  getOrderByToken,
  getOrderItemSnapshots,
  getReservedFinishQuantities,
  markSessionUnknown,
  reserveCheckout,
} from "../repositories/commerce-repository";
import type { CheckoutRequest } from "../schemas/cart";
import { processCurrentSession } from "./payment-events";
import { isDefinitiveStripeFailure, stripeClient } from "../stripe/client";
import {
  stripeSessionIdMatchesMode,
  stripeSessionMatchesMode,
} from "../stripe/mode";

export class CheckoutError extends Error {
  constructor(
    public readonly reason:
      "unavailable" | "invalid" | "inventory" | "retry" | "expired",
  ) {
    super(reason);
  }
}

export async function beginCheckout(
  input: CheckoutRequest,
  locale: "fr" | "en" | "de",
) {
  const env = requireCommerceEnv();
  try {
    const items = cartSchema.min(1).parse(input.items);
    const lamps = items.reduce(
      (sum, item) =>
        sum +
        FINISHES.reduce(
          (count, finish) => count + item.composition[finish],
          0,
        ) *
          item.quantity,
      0,
    );
    if (lamps < 1 || lamps > 30) throw new Error("Invalid physical quantity");
    shippingCents(input.country);
  } catch {
    throw new CheckoutError("invalid");
  }

  // Stripe requires an expiry at least 30 minutes ahead. The DB holds a further five-minute buffer.
  const proposedExpiry = new Date(Date.now() + 31 * 60_000);
  let order;
  try {
    order = await reserveCheckout(input, proposedExpiry, locale);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P0001"
    ) {
      throw new CheckoutError("inventory");
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "22023"
    ) {
      throw new CheckoutError("invalid");
    }
    // A transport/configuration failure must not be reported as a bad cart.
    throw new CheckoutError("retry");
  }

  const [snapshots, allocations] = await Promise.all([
    getOrderItemSnapshots(order.id),
    getReservedFinishQuantities(order.id),
  ]);
  let quote: ReturnType<typeof quoteCart>;
  try {
    quote = quoteCart(
      input.items,
      input.country,
      packsFromSnapshots(snapshots, lumizaProduct.packs),
    );
  } catch {
    if (order.status === ORDER_STATES.creating) await failSession(order.id);
    throw new CheckoutError("unavailable");
  }
  if (
    !snapshotsMatchQuote(snapshots, quote) ||
    FINISHES.some(
      (finish) => allocations[finish] !== quote.finishQuantities[finish],
    ) ||
    order.total_cents !== quote.totalCents ||
    order.subtotal_cents !== quote.subtotalCents ||
    order.shipping_cents !== quote.shippingCents ||
    order.shipping_country !== input.country
  ) {
    // Never charge an amount inconsistent with the reserved order snapshots.
    if (order.status === ORDER_STATES.creating) await failSession(order.id);
    throw new CheckoutError("unavailable");
  }

  if (
    order.stripe_client_secret &&
    order.stripe_checkout_session_id &&
    (order.status === ORDER_STATES.pending ||
      order.status === ORDER_STATES.processing)
  ) {
    if (
      !stripeSessionIdMatchesMode(
        order.stripe_checkout_session_id,
        env.STRIPE_MODE,
      )
    )
      throw new CheckoutError("retry");
    if (new Date(order.stripe_expires_at).getTime() <= Date.now()) {
      try {
        const stripe = stripeClient();
        let current = await stripe.checkout.sessions.retrieve(
          order.stripe_checkout_session_id,
        );
        if (!stripeSessionMatchesMode(current, env.STRIPE_MODE))
          throw new CheckoutError("retry");
        if (current.status === "open") {
          current = await stripe.checkout.sessions.expire(current.id);
        }
        await processCurrentSession(
          current,
          `reconcile:${current.id}:${current.status}:${current.payment_status}`,
          "reconcile",
        );
        const reconciled = await getOrderByToken(order.confirmation_token);
        if (
          reconciled?.status === ORDER_STATES.expired ||
          reconciled?.status === ORDER_STATES.failed
        ) {
          // Only a terminal, released hold permits a new attempt on retry.
          throw new CheckoutError("expired");
        }
      } catch (error) {
        if (error instanceof CheckoutError) throw error;
        // Unknown Stripe/payment state: preserve the attempt and its hold.
        throw new CheckoutError("retry");
      }
      throw new CheckoutError("retry");
    }
    return {
      clientSecret: order.stripe_client_secret,
      token: order.confirmation_token,
      reference: order.public_order_reference,
      quote,
    };
  }
  if (
    order.status === ORDER_STATES.failed ||
    order.status === ORDER_STATES.expired
  ) {
    throw new CheckoutError("expired");
  }
  if (order.status === ORDER_STATES.paid) throw new CheckoutError("invalid");
  if (
    order.status !== ORDER_STATES.creating &&
    order.status !== ORDER_STATES.uncertain
  )
    throw new CheckoutError("retry");

  const stripe = stripeClient();
  const shippingLabel = {
    fr: frMessages.Checkout.shipping,
    en: enMessages.Checkout.shipping,
    de: deMessages.Checkout.shipping,
  }[locale];
  let session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        ui_mode: "embedded_page",
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: order.id,
        metadata: { order_id: order.id, shipping_country: input.country },
        locale,
        line_items: quote.lines.map((line) => ({
          price_data: {
            currency: "eur",
            unit_amount: line.unitPriceCents,
            product_data: {
              name: `${lumizaProduct.name[locale]} · ${line.packId.toUpperCase()}`,
              description: FINISHES.filter(
                (finish) => line.composition[finish] > 0,
              )
                .map((finish) => `${line.composition[finish]} ${finish}`)
                .join(", "),
            },
          },
          quantity: line.quantity,
        })),
        shipping_address_collection: { allowed_countries: [input.country] },
        phone_number_collection: { enabled: true },
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: { amount: quote.shippingCents, currency: "eur" },
              display_name: shippingLabel,
            },
          },
        ],
        expires_at: Math.floor(
          new Date(order.stripe_expires_at).getTime() / 1000,
        ),
        return_url: `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/${locale}/order/confirmation?token=${order.confirmation_token}&session_id={CHECKOUT_SESSION_ID}`,
        redirect_on_completion: "if_required",
      },
      { idempotencyKey: `lumiza-checkout-${order.checkout_attempt_id}` },
    );
  } catch (error) {
    if (isDefinitiveStripeFailure(error)) {
      await failSession(order.id);
      throw new CheckoutError("unavailable");
    }
    await markSessionUnknown(order.id);
    throw new CheckoutError("retry");
  }
  if (
    !session.client_secret ||
    !stripeSessionMatchesMode(session, env.STRIPE_MODE)
  ) {
    await markSessionUnknown(order.id);
    throw new CheckoutError("retry");
  }
  try {
    await attachSession(
      order.id,
      session.id,
      session.client_secret,
      new Date(session.expires_at * 1000),
    );
  } catch {
    // Idempotency key preserves the Stripe session on retry; stock remains held.
    await markSessionUnknown(order.id);
    throw new CheckoutError("retry");
  }
  return {
    clientSecret: session.client_secret,
    token: order.confirmation_token,
    reference: order.public_order_reference,
    quote,
  };
}
