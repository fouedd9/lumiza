import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/commerce-env.server", () => ({
  requireCommerceEnv: vi.fn(),
}));
vi.mock("@/features/commerce/repositories/commerce-repository", () => ({
  getOrderByToken: vi.fn(),
  getOrderItemSnapshots: vi.fn(),
}));
vi.mock("@/features/commerce/stripe/client", () => ({ stripeClient: vi.fn() }));

import { checkConfirmation } from "@/features/commerce/services/confirmation";
import { requireCommerceEnv } from "@/config/commerce-env.server";
import {
  getOrderByToken,
  getOrderItemSnapshots,
} from "@/features/commerce/repositories/commerce-repository";
import { stripeClient } from "@/features/commerce/stripe/client";

const token = "a37e6d6e-3b0d-4f72-9e1a-9ca900dda143";
const baseOrder = {
  id: "order-internal",
  stripe_checkout_session_id: "cs_test_123",
  total_cents: 4499,
  public_order_reference: "LZ-TEST123",
  status: "pending_payment",
};
const baseSession = {
  id: "cs_test_123",
  livemode: false,
  amount_total: 4499,
  currency: "eur",
  mode: "payment",
  metadata: { order_id: "order-internal" },
  payment_status: "unpaid",
};

describe("private order confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCommerceEnv).mockReturnValue({
      STRIPE_MODE: "test",
    } as never);
    vi.mocked(getOrderByToken).mockResolvedValue(baseOrder as never);
    vi.mocked(getOrderItemSnapshots).mockResolvedValue([
      {
        quantity: 1,
        unit_quantity: 2,
        packs: { code: "duo" },
        composition: { black: 0, gold: 1, silver: 1 },
      },
    ] as never);
    vi.mocked(stripeClient).mockReturnValue({
      checkout: {
        sessions: { retrieve: vi.fn().mockResolvedValue(baseSession) },
      },
    } as never);
  });

  it("rejects an invalid token before querying an order", async () => {
    expect(await checkConfirmation("guess", undefined)).toEqual({
      state: "invalid",
    });
    expect(getOrderByToken).not.toHaveBeenCalled();
  });

  it("rejects a session mismatch and does not reveal the reference", async () => {
    expect(await checkConfirmation(token, "cs_test_elsewhere")).toEqual({
      state: "invalid",
    });
  });

  it("keeps a pending order pending even if Stripe has just settled", async () => {
    vi.mocked(stripeClient).mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi
            .fn()
            .mockResolvedValue({ ...baseSession, payment_status: "paid" }),
        },
      },
    } as never);
    expect(await checkConfirmation(token, "cs_test_123")).toEqual({
      state: "pending",
      reference: undefined,
    });
  });

  it("shows a reference only after both the database and Stripe say paid", async () => {
    vi.mocked(getOrderByToken).mockResolvedValue({
      ...baseOrder,
      status: "paid",
    } as never);
    vi.mocked(stripeClient).mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi
            .fn()
            .mockResolvedValue({ ...baseSession, payment_status: "paid" }),
        },
      },
    } as never);
    expect(await checkConfirmation(token, "cs_test_123")).toEqual({
      state: "paid",
      reference: "LZ-TEST123",
      items: [
        {
          pack: "duo",
          quantity: 1,
          unitQuantity: 2,
          composition: { black: 0, gold: 1, silver: 1 },
        },
      ],
    });
  });

  it("shows a terminal failure without a reference", async () => {
    vi.mocked(getOrderByToken).mockResolvedValue({
      ...baseOrder,
      status: "expired",
    } as never);
    expect(await checkConfirmation(token, "cs_test_123")).toEqual({
      state: "failed",
      reference: undefined,
    });
  });
});
