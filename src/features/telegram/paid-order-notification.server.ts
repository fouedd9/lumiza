import "server-only";

import { randomUUID } from "node:crypto";

import type Stripe from "stripe";

import {
  claimPaidTelegram,
  finishPaidTelegram,
  getOrderItemSnapshots,
  getPaidOrderForTelegram,
} from "@/features/commerce/repositories/commerce-repository";
import { stripeClient } from "@/features/commerce/stripe/client";
import { stripeSessionMatchesMode } from "@/features/commerce/stripe/mode";
import { requireCommerceEnv } from "@/config/commerce-env.server";
import { FINISHES } from "@/features/commerce/schemas/cart";
import { formatCurrency } from "@/lib/utils/format-currency";

type PaidOrder = NonNullable<
  Awaited<ReturnType<typeof getPaidOrderForTelegram>>
>;
type OrderLines = Awaited<ReturnType<typeof getOrderItemSnapshots>>;
type DeliveryResult = "sent" | "retry" | "uncertain";

const finishNames = { black: "Noir", gold: "Or", silver: "Argent" };
const countryNames = {
  FR: "France",
  BE: "Belgique",
  DE: "Allemagne",
  CH: "Suisse",
};

function safeText(value: string | null | undefined, max = 160) {
  return value
    ? value
        .replace(
          /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
          " ",
        )
        .trim()
        .slice(0, max)
    : "";
}

function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[telegram] configuration missing");
    return null;
  }
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token) || !/^-?\d+$/.test(chatId)) {
    console.error("[telegram] configuration malformed");
    return null;
  }
  return { token, chatId };
}

export function renderPaidOrderTelegram(
  order: PaidOrder,
  lines: OrderLines,
  session: Stripe.Checkout.Session,
) {
  const money = (cents: number) => formatCurrency(cents, order.currency, "fr");
  const address = session.collected_information?.shipping_details?.address;
  const shippingName = session.collected_information?.shipping_details?.name;
  const name = safeText(order.customer_name ?? shippingName);
  const email = safeText(order.customer_email, 254);
  const phone = safeText(session.customer_details?.phone, 40);
  const street = [safeText(address?.line1), safeText(address?.line2)]
    .filter(Boolean)
    .join(", ");
  const city = [safeText(address?.postal_code, 24), safeText(address?.city)]
    .filter(Boolean)
    .join(" ");
  const region = safeText(address?.state);
  const lamps = lines.reduce(
    (sum, line) => sum + line.quantity * line.unit_quantity,
    0,
  );
  return [
    "🛍️ NOUVELLE COMMANDE LUMIZA",
    "",
    `Commande : ${safeText(order.public_order_reference, 40)}`,
    `Montant : ${money(order.total_cents)}`,
    "Paiement : Confirmé ✅",
    "",
    ...lines.flatMap((line) => [
      `Pack : ${safeText(line.packs.code.toUpperCase(), 12)} — ${line.quantity} ${line.quantity === 1 ? "pack" : "packs"} — ${line.quantity * line.unit_quantity} lampes`,
      `Composition : ${FINISHES.filter((finish) => line.composition[finish] > 0)
        .map(
          (finish) =>
            `${line.composition[finish] * line.quantity} × ${finishNames[finish]}`,
        )
        .join(", ")}`,
    ]),
    `Lampes au total : ${lamps}`,
    "",
    "👤 CLIENT",
    ...(name ? [`Nom : ${name}`] : []),
    ...(email ? [`Email : ${email}`] : []),
    ...(phone ? [`Téléphone : ${phone}`] : []),
    "",
    "📍 LIVRAISON",
    ...(street ? [street] : []),
    ...(city ? [city] : []),
    ...(region ? [region] : []),
    countryNames[order.shipping_country],
    "",
    `🚚 Livraison : ${money(order.shipping_cents)}`,
    `💰 Total : ${money(order.total_cents)}`,
  ].join("\n");
}

async function sendTelegram(
  config: NonNullable<ReturnType<typeof telegramConfig>>,
  message: string,
): Promise<DeliveryResult> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: config.chatId, text: message }),
        signal: AbortSignal.timeout(3_000),
      },
    );
    // A received Bot API rejection is safely retryable; an ambiguous server
    // failure is not, because sendMessage offers no idempotency key.
    if (response.status >= 500) return "uncertain";
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "ok" in body) {
      return body.ok === true && response.ok ? "sent" : "retry";
    }
    return "uncertain";
  } catch {
    return "uncertain";
  }
}

export async function dispatchPendingPaidTelegram(
  limit = 3,
  onlySessionId: string | null = null,
  verifiedSession?: Stripe.Checkout.Session,
) {
  const config = telegramConfig();
  if (!config) return;
  const workerId = randomUUID();
  for (let index = 0; index < limit; index++) {
    const job = await claimPaidTelegram(workerId, onlySessionId);
    if (!job) break;
    let delivery: DeliveryResult = "retry";
    try {
      const order = await getPaidOrderForTelegram(job.order_id);
      if (!order) throw new Error("Paid order unavailable");
      const mode = requireCommerceEnv().STRIPE_MODE;
      const session =
        verifiedSession?.id === order.stripe_checkout_session_id
          ? verifiedSession
          : await stripeClient().checkout.sessions.retrieve(
              order.stripe_checkout_session_id,
            );
      if (
        !stripeSessionMatchesMode(session, mode) ||
        session.id !== order.stripe_checkout_session_id ||
        session.status !== "complete" ||
        session.payment_status !== "paid" ||
        session.currency !== "eur" ||
        session.amount_total !== order.total_cents ||
        session.metadata?.order_id !== order.id ||
        session.metadata?.shipping_country !== order.shipping_country ||
        (session.collected_information?.shipping_details?.address.country &&
          session.collected_information.shipping_details.address.country !==
            order.shipping_country)
      ) {
        throw new Error("Paid session mismatch");
      }
      const lines = await getOrderItemSnapshots(order.id);
      delivery = await sendTelegram(
        config,
        renderPaidOrderTelegram(order, lines, session),
      );
    } catch {
      console.error("[telegram] paid notification preparation failed");
    }
    try {
      await finishPaidTelegram(job.id, workerId, delivery);
    } catch {
      // A claimed job is deliberately not reclaimed automatically; its send
      // outcome may be unknown and a second send could duplicate the alert.
      console.error("[telegram] notification acknowledgement failed");
    }
    if (delivery !== "sent") console.error(`[telegram] delivery ${delivery}`);
    if (onlySessionId) break;
  }
}

export async function notifyNewPaidOrder(session: Stripe.Checkout.Session) {
  try {
    await dispatchPendingPaidTelegram(1, session.id, session);
  } catch {
    // Payment processing has already committed. Telegram is never allowed to
    // change the webhook response or roll back the order.
    console.error("[telegram] paid notification unavailable");
  }
}
