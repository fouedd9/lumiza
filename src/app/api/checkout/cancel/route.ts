import { NextResponse } from "next/server";
import { z } from "zod";

import { getCommerceEnv } from "@/config/commerce-env.server";
import { getOrderByToken } from "@/features/commerce/repositories/commerce-repository";
import { processCurrentSession } from "@/features/commerce/services/payment-events";
import { stripeClient } from "@/features/commerce/stripe/client";
import {
  stripeSessionIdMatchesMode,
  stripeSessionMatchesMode,
} from "@/features/commerce/stripe/mode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = getCommerceEnv();
  if (!env.success)
    return NextResponse.json({ code: "unavailable" }, { status: 503 });
  if (
    request.headers.get("origin") !==
    new URL(env.data.NEXT_PUBLIC_SITE_URL).origin
  ) {
    return NextResponse.json({ code: "invalid" }, { status: 403 });
  }
  try {
    const raw = await request.text();
    if (raw.length > 512)
      return NextResponse.json({ code: "invalid" }, { status: 413 });
    const input = z.object({ token: z.uuid() }).safeParse(JSON.parse(raw));
    if (!input.success)
      return NextResponse.json({ code: "invalid" }, { status: 400 });
    const order = await getOrderByToken(input.data.token);
    if (!order?.stripe_checkout_session_id)
      return NextResponse.json({ code: "invalid" }, { status: 404 });
    if (
      !stripeSessionIdMatchesMode(
        order.stripe_checkout_session_id,
        env.data.STRIPE_MODE,
      )
    )
      return NextResponse.json({ code: "invalid" }, { status: 400 });
    const stripe = stripeClient();
    let session = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
    );
    if (
      !stripeSessionMatchesMode(session, env.data.STRIPE_MODE) ||
      session.metadata?.order_id !== order.id
    )
      return NextResponse.json({ code: "invalid" }, { status: 400 });
    if (session.status === "open") {
      try {
        session = await stripe.checkout.sessions.expire(session.id);
      } catch {
        session = await stripe.checkout.sessions.retrieve(session.id);
      }
    }
    await processCurrentSession(
      session,
      `cancel:${session.id}:${session.status}:${session.payment_status}`,
      "reconcile",
    );
    return NextResponse.json({
      code:
        session.status === "expired" && session.payment_status === "unpaid"
          ? "canceled"
          : "pending",
    });
  } catch (error) {
    console.error(
      "Checkout cancellation failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json({ code: "retry" }, { status: 503 });
  }
}
