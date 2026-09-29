import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/config/commerce-env.server", () => ({
  requireCommerceEnv: vi.fn(),
}));

vi.mock("@/features/commerce/repositories/commerce-repository", () => ({
  processPaymentEvent: vi.fn(),
  enqueuePaidEmail: vi.fn(),
}));
vi.mock("@/features/telegram/paid-order-notification.server", () => ({
  notifyNewPaidOrder: vi.fn(),
}));

import {
  enqueuePaidEmail,
  processPaymentEvent,
} from "@/features/commerce/repositories/commerce-repository";
import {
  processCurrentSession,
  processVerifiedStripeEvent,
} from "@/features/commerce/services/payment-events";
import { requireCommerceEnv } from "@/config/commerce-env.server";
import { notifyNewPaidOrder } from "@/features/telegram/paid-order-notification.server";

function session(selected: string, actual: string) {
  return {
    id: "cs_test_country",
    livemode: false,
    currency: "eur",
    mode: "payment",
    metadata: { shipping_country: selected },
    collected_information: {
      shipping_details: { address: { country: actual } },
    },
    amount_total: 6999,
    status: "complete",
    payment_status: "paid",
    payment_intent: null,
    customer_details: null,
  } as unknown as Stripe.Checkout.Session;
}

describe("Stripe shipping-country reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCommerceEnv).mockReturnValue({
      STRIPE_MODE: "test",
    } as never);
  });

  it("accepts the selected country when Stripe collected the same country", async () => {
    await processCurrentSession(
      session("BE", "BE"),
      "event-test",
      "checkout.session.completed",
    );
    expect(processPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ country: "BE", amountTotal: 6999 }),
    );
    expect(enqueuePaidEmail).toHaveBeenCalledWith("cs_test_country");
    expect(notifyNewPaidOrder).toHaveBeenCalledOnce();
  });

  it("rejects a different final shipping country before processing payment", async () => {
    await expect(
      processCurrentSession(
        session("DE", "FR"),
        "event-test",
        "checkout.session.completed",
      ),
    ).rejects.toThrow("Shipping country mismatch");
    expect(processPaymentEvent).not.toHaveBeenCalled();
    expect(notifyNewPaidOrder).not.toHaveBeenCalled();
  });

  it("does not notify Telegram for an unpaid session", async () => {
    const unpaid = {
      ...session("FR", "FR"),
      payment_status: "unpaid",
    } as never;
    await processCurrentSession(
      unpaid,
      "event-unpaid",
      "checkout.session.completed",
    );
    expect(notifyNewPaidOrder).not.toHaveBeenCalled();
  });

  it("ignores payment_intent.succeeded rather than sending a second alert", async () => {
    await expect(
      processVerifiedStripeEvent({
        id: "event-intent",
        type: "payment_intent.succeeded",
        livemode: false,
      } as never),
    ).resolves.toBe("ignored");
    expect(processPaymentEvent).not.toHaveBeenCalled();
    expect(notifyNewPaidOrder).not.toHaveBeenCalled();
  });

  it("routes both paid Checkout event types through the same durable notification gate", async () => {
    await processCurrentSession(
      session("FR", "FR"),
      "event-completed",
      "checkout.session.completed",
    );
    await processCurrentSession(
      session("FR", "FR"),
      "event-async",
      "checkout.session.async_payment_succeeded",
    );
    expect(notifyNewPaidOrder).toHaveBeenCalledTimes(2);
    expect(notifyNewPaidOrder).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "cs_test_country" }),
    );
    expect(notifyNewPaidOrder).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "cs_test_country" }),
    );
  });

  it("does not fail a reconciled payment if Telegram throws", async () => {
    vi.mocked(processPaymentEvent).mockResolvedValue("processed" as never);
    vi.mocked(notifyNewPaidOrder).mockRejectedValueOnce(
      new Error("Telegram outage"),
    );
    await expect(
      processCurrentSession(
        session("FR", "FR"),
        "event-telegram-outage",
        "checkout.session.completed",
      ),
    ).resolves.toBe("processed");
    expect(processPaymentEvent).toHaveBeenCalledOnce();
  });
});
