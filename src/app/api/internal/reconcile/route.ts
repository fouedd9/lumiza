import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getCommerceEnv } from "@/config/commerce-env.server";
import { listReconciliationCandidates } from "@/features/commerce/repositories/commerce-repository";
import { beginCheckout } from "@/features/commerce/services/checkout";
import { checkoutRequestSchema } from "@/features/commerce/schemas/cart";
import { processCurrentSession } from "@/features/commerce/services/payment-events";
import { stripeClient } from "@/features/commerce/stripe/client";
import {
  stripeSessionIdMatchesMode,
  stripeSessionMatchesMode,
} from "@/features/commerce/stripe/mode";
import { dispatchPendingConfirmations } from "@/features/email/confirmation-email.server";

export const runtime = "nodejs";

function validBearer(value: string | null, secret: string | undefined) {
  if (!value || !secret || !secret.startsWith("cron_")) return false;
  const supplied = Buffer.from(value);
  const expected = Buffer.from(`Bearer ${secret}`);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export async function GET(request: Request) {
  if (
    !validBearer(request.headers.get("authorization"), process.env.CRON_SECRET)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const env = getCommerceEnv();
  if (!env.success)
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  let examined = 0;
  let failed = 0;
  const candidates = await listReconciliationCandidates();
  for (const candidate of candidates) {
    try {
      const sessionId = candidate.stripe_checkout_session_id;
      if (!sessionId) {
        const retry = checkoutRequestSchema.parse({
          attemptId: candidate.checkout_attempt_id,
          country: candidate.shipping_country,
          items: candidate.selection_signature,
        });
        await beginCheckout(retry, candidate.checkout_locale);
        // The same Stripe idempotency key recovers a session created before a timeout.
        // The next reconciliation pass sees the attached session.
        examined++;
        continue;
      }
      if (!stripeSessionIdMatchesMode(sessionId, env.data.STRIPE_MODE))
        throw new Error("Stripe session mode mismatch");
      let session = await stripeClient().checkout.sessions.retrieve(sessionId);
      if (!stripeSessionMatchesMode(session, env.data.STRIPE_MODE))
        throw new Error("Stripe session mode mismatch");
      if (
        session.status === "open" &&
        new Date(candidate.stripe_expires_at).getTime() <= Date.now()
      ) {
        session = await stripeClient().checkout.sessions.expire(session.id);
      }
      await processCurrentSession(
        session,
        `reconcile:${session.id}:${session.status}:${session.payment_status}`,
        "reconcile",
      );
      examined++;
    } catch (error) {
      failed++;
      console.error(
        "Reconciliation failed",
        candidate.id,
        error instanceof Error ? error.name : "unknown",
      );
    }
  }
  try {
    const email = await dispatchPendingConfirmations();
    failed += email.failed;
  } catch {
    failed++;
    console.error("Confirmation email reconciliation unavailable");
  }
  return NextResponse.json(
    { examined, failed },
    { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
