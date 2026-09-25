import "server-only";

import { randomUUID } from "node:crypto";

import { business } from "@/config/business";
import de from "@/../messages/de.json";
import en from "@/../messages/en.json";
import fr from "@/../messages/fr.json";
import {
  getOrderItemSnapshots,
  getPaidOrderForEmail,
  claimConfirmationEmail,
  finishConfirmationEmail,
  backfillPaidEmails,
} from "@/features/commerce/repositories/commerce-repository";
import { formatCurrency } from "@/lib/utils/format-currency";
import { FINISHES } from "@/features/commerce/schemas/cart";

import { emailProvider, type TransactionalEmail } from "./provider.server";

const copy = { fr, en, de };

export async function renderConfirmationEmail(
  orderId: string,
): Promise<TransactionalEmail | null> {
  const order = await getPaidOrderForEmail(orderId);
  if (!order?.customer_email) return null;
  const lines = await getOrderItemSnapshots(order.id);
  const locale = order.checkout_locale;
  const t = copy[locale];
  const money = (cents: number) => formatCurrency(cents, "EUR", locale);
  const body = [
    t.Email.greeting,
    `${t.Email.reference}: ${order.public_order_reference}`,
    "",
    ...lines.flatMap((line) => [
      `${line.quantity} × LUMIZA · ${line.packs.code.toUpperCase()} · ${line.unit_quantity} ${line.unit_quantity === 1 ? t.Checkout.lamp : t.Checkout.lamps} — ${money(line.total_price_cents)}`,
      ...FINISHES.filter((finish) => line.composition[finish] > 0).map(
        (finish) =>
          `  ${line.composition[finish]} × ${t.Checkout.colors[finish]} ${t.Checkout.perPack}`,
      ),
    ]),
    "",
    `${t.Checkout.subtotal}: ${money(order.subtotal_cents)}`,
    `${t.Checkout.shipping}: ${money(order.shipping_cents)}`,
    `${t.Checkout.total}: ${money(order.total_cents)}`,
    `${t.Checkout.country}: ${t.Checkout.countries[order.shipping_country]}`,
    "",
    business.supportEmail ?? t.Email.supportPending,
  ];
  return {
    to: order.customer_email,
    subject: `${t.Email.subject} ${order.public_order_reference}`,
    text: body.join("\n"),
    idempotencyKey: `lumiza-order-confirmation-${order.id}`,
  };
}

export async function dispatchPendingConfirmations(limit = 10) {
  const provider = emailProvider();
  if (!provider.enabled) return { sent: 0, failed: 0, disabled: true };
  await backfillPaidEmails();
  const workerId = randomUUID();
  let sent = 0,
    failed = 0;
  for (let index = 0; index < limit; index++) {
    const job = await claimConfirmationEmail(workerId);
    if (!job) break;
    let delivered = false;
    try {
      const message = await renderConfirmationEmail(job.order_id);
      if (!message) throw new Error("Paid order has no email recipient");
      await provider.send(message);
      delivered = true;
      await finishConfirmationEmail(job.id, workerId, true);
      sent++;
    } catch {
      failed++;
      // If delivery happened but acknowledgement failed, the provider's stable
      // idempotency key must prevent a second email when the lease expires.
      if (!delivered) {
        try {
          await finishConfirmationEmail(job.id, workerId, false);
        } catch {
          console.error("Email claim release unavailable");
        }
      }
      console.error("Order confirmation email dispatch failed");
    }
  }
  return { sent, failed, disabled: false };
}
