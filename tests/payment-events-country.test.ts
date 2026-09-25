import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/commerce-env.server", () => ({
  requireCommerceEnv: vi.fn(),
}));

vi.mock("@/features/commerce/repositories/commerce-repository", () => ({
  processPaymentEvent: vi.fn(),
  enqueuePaidEmail: vi.fn(),
}));

import {
  enqueuePaidEmail,
  processPaymentEvent,
} from "@/features/commerce/repositories/commerce-repository";
import { processCurrentSession } from "@/features/commerce/services/payment-events";
import { requireCommerceEnv } from "@/config/commerce-env.server";

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
  } as never;
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
  });
});
