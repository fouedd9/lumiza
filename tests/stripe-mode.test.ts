import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/commerce-env.server", () => ({
  requireCommerceEnv: vi.fn(),
}));
vi.mock("@/features/commerce/stripe/client", () => ({ stripeClient: vi.fn() }));
vi.mock("@/features/commerce/repositories/commerce-repository", () => ({
  processPaymentEvent: vi.fn(),
  enqueuePaidEmail: vi.fn(),
}));

import { requireCommerceEnv } from "@/config/commerce-env.server";
import { processVerifiedStripeEvent } from "@/features/commerce/services/payment-events";
import { stripeClient } from "@/features/commerce/stripe/client";
import {
  stripeEventMatchesMode,
  stripeSessionMatchesMode,
} from "@/features/commerce/stripe/mode";

describe("Stripe mode boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCommerceEnv).mockReturnValue({
      STRIPE_MODE: "test",
    } as never);
  });

  it("requires matching event livemode and session ID/payload mode", () => {
    expect(stripeEventMatchesMode({ livemode: false }, "test")).toBe(true);
    expect(stripeEventMatchesMode({ livemode: true }, "live")).toBe(true);
    expect(stripeEventMatchesMode({ livemode: true }, "test")).toBe(false);
    expect(stripeEventMatchesMode({ livemode: false }, "live")).toBe(false);
    expect(
      stripeSessionMatchesMode({ id: "cs_test_123", livemode: false }, "test"),
    ).toBe(true);
    expect(
      stripeSessionMatchesMode({ id: "cs_live_123", livemode: true }, "live"),
    ).toBe(true);
    expect(
      stripeSessionMatchesMode({ id: "cs_live_123", livemode: false }, "test"),
    ).toBe(false);
    expect(
      stripeSessionMatchesMode({ id: "cs_test_123", livemode: true }, "live"),
    ).toBe(false);
  });

  it.each([
    ["test", true],
    ["live", false],
  ] as const)(
    "rejects a mismatched webhook event in %s mode",
    async (mode, livemode) => {
      vi.mocked(requireCommerceEnv).mockReturnValue({
        STRIPE_MODE: mode,
      } as never);
      await expect(
        processVerifiedStripeEvent({
          id: "evt_example",
          type: "checkout.session.completed",
          livemode,
          data: {
            object: { id: `cs_${livemode ? "live" : "test"}_123`, livemode },
          },
        } as never),
      ).rejects.toThrow("Stripe event mode mismatch");
      expect(stripeClient).not.toHaveBeenCalled();
    },
  );

  it("rejects an event whose session payload contradicts TEST mode", async () => {
    await expect(
      processVerifiedStripeEvent({
        id: "evt_example",
        type: "checkout.session.completed",
        livemode: false,
        data: { object: { id: "cs_live_123", livemode: true } },
      } as never),
    ).rejects.toThrow("Stripe session mode mismatch");
    expect(stripeClient).not.toHaveBeenCalled();
  });
});
