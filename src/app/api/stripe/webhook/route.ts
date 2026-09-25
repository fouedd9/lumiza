import { NextResponse } from "next/server";

import { getCommerceEnv } from "@/config/commerce-env.server";
import { processVerifiedStripeEvent } from "@/features/commerce/services/payment-events";
import { stripeClient } from "@/features/commerce/stripe/client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = getCommerceEnv();
  if (!parsed.success)
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const payload = await request.text();
  if (payload.length > 1_000_000)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(
      payload,
      signature,
      parsed.data.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    await processVerifiedStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      "Stripe event processing failed",
      event.id,
      error instanceof Error ? error.name : "unknown",
    );
    // Stripe retries. The database transaction rolls back the event record on failure.
    return NextResponse.json({ error: "Retry later" }, { status: 503 });
  }
}
