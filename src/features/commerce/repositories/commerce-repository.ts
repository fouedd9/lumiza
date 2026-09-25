import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireCommerceEnv } from "@/config/commerce-env.server";

import type { CheckoutRequest } from "../schemas/cart";
import type { OrderStatus } from "../domain/states";
import type { ShippingCountry } from "../domain/shipping";
import {
  compositionSchema,
  solidComposition,
  type Composition,
} from "../schemas/cart";

export type StoredOrder = {
  id: string;
  public_order_reference: string;
  checkout_attempt_id: string;
  selection_signature: CheckoutRequest["items"];
  checkout_locale: "fr" | "en" | "de";
  confirmation_token: string;
  status: OrderStatus;
  shipping_country: ShippingCountry;
  currency: "EUR";
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  stripe_checkout_session_id: string | null;
  stripe_client_secret: string | null;
  stripe_expires_at: string;
};

function client() {
  const env = requireCommerceEnv();
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

function unwrap<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
}): T {
  if (result.error)
    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
    });
  if (result.data === null) throw new Error("Missing database result");
  return result.data;
}

export async function reserveCheckout(
  input: CheckoutRequest,
  expiresAt: Date,
  locale: "fr" | "en" | "de",
): Promise<StoredOrder> {
  const result = await client().rpc("commerce_reserve_checkout", {
    p_attempt: input.attemptId,
    p_country: input.country,
    p_items: input.items,
    p_expires_at: expiresAt.toISOString(),
    p_locale: locale,
  });
  return unwrap(result) as StoredOrder;
}

export async function attachSession(
  orderId: string,
  sessionId: string,
  secret: string,
  expiresAt: Date,
): Promise<StoredOrder> {
  const result = await client().rpc("commerce_attach_session", {
    p_order: orderId,
    p_session: sessionId,
    p_client_secret: secret,
    p_expires_at: expiresAt.toISOString(),
  });
  return unwrap(result) as StoredOrder;
}

export async function failSession(orderId: string) {
  const result = await client().rpc("commerce_fail_session", {
    p_order: orderId,
  });
  if (result.error) throw new Error(result.error.message);
}

export async function markSessionUnknown(orderId: string) {
  const result = await client().rpc("commerce_mark_session_unknown", {
    p_order: orderId,
  });
  if (result.error) throw new Error(result.error.message);
}

export async function getOrderByToken(
  token: string,
): Promise<StoredOrder | null> {
  const result = await client()
    .from("orders")
    .select("*")
    .eq("confirmation_token", token)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as StoredOrder | null;
}

const itemSnapshotSchema = z.array(
  z.object({
    quantity: z.number().int(),
    unit_quantity: z.number().int(),
    unit_price_cents: z.number().int(),
    total_price_cents: z.number().int(),
    composition: compositionSchema.nullable(),
    packs: z.object({ code: z.string() }),
    product_variants: z
      .object({ color: z.enum(["black", "gold", "silver"]) })
      .nullable(),
  }),
);

export async function getOrderItemSnapshots(orderId: string) {
  const result = await client()
    .from("order_items")
    .select(
      "quantity, unit_quantity, unit_price_cents, total_price_cents, composition, packs(code), product_variants(color)",
    )
    .eq("order_id", orderId);
  if (result.error) throw new Error(result.error.message);
  return itemSnapshotSchema.parse(result.data).map((line) => ({
    ...line,
    composition:
      line.composition ??
      legacyComposition(line.product_variants?.color, line.unit_quantity),
  }));
}

export async function getReservedFinishQuantities(
  orderId: string,
): Promise<Composition> {
  const reservation = await client()
    .from("inventory_reservations")
    .select("id")
    .eq("order_id", orderId)
    .single();
  if (reservation.error || !reservation.data)
    throw new Error("Missing reservation");
  const result = await client()
    .from("reservation_allocations")
    .select("quantity, product_variants(color)")
    .eq("reservation_id", reservation.data.id);
  if (result.error) throw new Error("Missing finish allocation");
  const rows = z
    .array(
      z.object({
        quantity: z.number().int().positive(),
        product_variants: z.object({
          color: z.enum(["black", "gold", "silver"]),
        }),
      }),
    )
    .parse(result.data);
  const quantities: Composition = { black: 0, gold: 0, silver: 0 };
  for (const row of rows)
    quantities[row.product_variants.color] += row.quantity;
  return quantities;
}

function legacyComposition(
  color: "black" | "gold" | "silver" | undefined,
  size: number,
): Composition {
  if (!color) throw new Error("Missing historical finish");
  return solidComposition(color, size);
}

export async function processPaymentEvent(input: {
  eventId: string;
  eventType: string;
  sessionId: string;
  paymentStatus: string;
  sessionStatus: string;
  amountTotal: number;
  country: string;
  paymentIntent: string | null;
  email: string | null;
  name: string | null;
}) {
  const result = await client().rpc("commerce_process_event", {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_session: input.sessionId,
    p_payment_status: input.paymentStatus,
    p_session_status: input.sessionStatus,
    p_amount_total: input.amountTotal,
    p_shipping_country: input.country,
    p_payment_intent: input.paymentIntent,
    p_email: input.email,
    p_name: input.name,
  });
  return unwrap(result);
}

export async function listReconciliationCandidates() {
  const result = await client()
    .from("orders")
    .select(
      "id, checkout_attempt_id, selection_signature, shipping_country, checkout_locale, stripe_checkout_session_id, stripe_expires_at, status",
    )
    .in("status", [
      "creating_session",
      "session_unknown",
      "pending_payment",
      "payment_processing",
    ])
    .order("created_at")
    .limit(50);
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function enqueuePaidEmail(sessionId: string) {
  const result = await client().rpc("commerce_enqueue_paid_email", {
    p_session: sessionId,
  });
  return unwrap(result);
}

export async function backfillPaidEmails() {
  const result = await client().rpc("commerce_backfill_paid_emails");
  return unwrap(result) as number;
}

export type ConfirmationEmailJob = {
  id: string;
  order_id: string;
  attempts: number;
};

export async function claimConfirmationEmail(
  workerId: string,
): Promise<ConfirmationEmailJob | null> {
  const result = await client().rpc("commerce_claim_confirmation_email", {
    p_worker: workerId,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as ConfirmationEmailJob | null;
}

export async function finishConfirmationEmail(
  jobId: string,
  workerId: string,
  success: boolean,
) {
  const result = await client().rpc("commerce_finish_confirmation_email", {
    p_job: jobId,
    p_worker: workerId,
    p_success: success,
  });
  if (result.error) throw new Error(result.error.message);
}

export async function getPaidOrderForEmail(orderId: string) {
  const result = await client()
    .from("orders")
    .select(
      "id, status, public_order_reference, checkout_locale, customer_email, shipping_country, subtotal_cents, shipping_cents, total_cents",
    )
    .eq("id", orderId)
    .eq("status", "paid")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as null | {
    id: string;
    status: "paid";
    public_order_reference: string;
    checkout_locale: "fr" | "en" | "de";
    customer_email: string | null;
    shipping_country: ShippingCountry;
    subtotal_cents: number;
    shipping_cents: number;
    total_cents: number;
  };
}
