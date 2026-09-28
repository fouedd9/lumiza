import "server-only";

import { z } from "zod";
import { requireCommerceEnv } from "@/config/commerce-env.server";

import { publicPaymentState } from "../domain/states";
import {
  getOrderByToken,
  getOrderItemSnapshots,
} from "../repositories/commerce-repository";
import type { Composition } from "../schemas/cart";
import { stripeClient } from "../stripe/client";
import {
  stripeSessionIdMatchesMode,
  stripeSessionMatchesMode,
} from "../stripe/mode";

export type ConfirmationResult = {
  state: "invalid" | "pending" | "paid" | "failed";
  reference?: string;
  subtotalInCents?: number;
  totalInCents?: number;
  shippingInCents?: number;
  items?: {
    pack: string;
    quantity: number;
    unitQuantity: number;
    unitPriceInCents: number;
    composition: Composition;
  }[];
};

export async function checkConfirmation(
  token: string | undefined,
  sessionId: string | undefined,
): Promise<ConfirmationResult> {
  if (!z.uuid().safeParse(token).success) return { state: "invalid" };
  const mode = requireCommerceEnv().STRIPE_MODE;
  if (sessionId && !stripeSessionIdMatchesMode(sessionId, mode))
    return { state: "invalid" };
  const order = await getOrderByToken(token!);
  if (
    !order ||
    !order.stripe_checkout_session_id ||
    !stripeSessionIdMatchesMode(order.stripe_checkout_session_id, mode) ||
    (sessionId && sessionId !== order.stripe_checkout_session_id)
  )
    return { state: "invalid" };
  const session = await stripeClient().checkout.sessions.retrieve(
    order.stripe_checkout_session_id,
  );
  if (
    !stripeSessionMatchesMode(session, mode) ||
    session.id !== order.stripe_checkout_session_id ||
    session.amount_total !== order.total_cents ||
    session.currency !== "eur" ||
    session.mode !== "payment" ||
    session.metadata?.order_id !== order.id
  ) {
    return { state: "invalid" };
  }
  const state = publicPaymentState(order.status);
  // Stripe may have completed while its webhook is in flight; wait for the durable DB transition.
  if (state === "paid" && session.payment_status !== "paid")
    return { state: "pending" };
  if (state === "failed" && session.payment_status === "paid")
    return { state: "pending" };
  const items =
    state === "paid"
      ? (await getOrderItemSnapshots(order.id)).map((line) => ({
          pack: line.packs.code,
          quantity: line.quantity,
          unitQuantity: line.unit_quantity,
          unitPriceInCents: line.unit_price_cents,
          composition: line.composition,
        }))
      : undefined;
  return {
    state,
    reference: state === "paid" ? order.public_order_reference : undefined,
    subtotalInCents: state === "paid" ? order.subtotal_cents : undefined,
    totalInCents: state === "paid" ? order.total_cents : undefined,
    shippingInCents: state === "paid" ? order.shipping_cents : undefined,
    items,
  };
}
