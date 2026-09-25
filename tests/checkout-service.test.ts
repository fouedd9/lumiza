import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/commerce-env.server", () => ({
  requireCommerceEnv: vi.fn(),
}));
vi.mock("@/features/commerce/repositories/commerce-repository", () => ({
  reserveCheckout: vi.fn(),
  getOrderItemSnapshots: vi.fn(),
  getReservedFinishQuantities: vi.fn(),
  attachSession: vi.fn(),
  failSession: vi.fn(),
  markSessionUnknown: vi.fn(),
  getOrderByToken: vi.fn(),
}));
vi.mock("@/features/commerce/services/payment-events", () => ({
  processCurrentSession: vi.fn(),
}));
vi.mock("@/features/commerce/stripe/client", () => ({
  stripeClient: vi.fn(),
  isDefinitiveStripeFailure: vi.fn(),
}));

import { requireCommerceEnv } from "@/config/commerce-env.server";
import {
  reserveCheckout,
  getOrderItemSnapshots,
  getReservedFinishQuantities,
  attachSession,
  failSession,
  getOrderByToken,
} from "@/features/commerce/repositories/commerce-repository";
import { processCurrentSession } from "@/features/commerce/services/payment-events";
import { stripeClient } from "@/features/commerce/stripe/client";
import {
  beginCheckout,
  CheckoutError,
} from "@/features/commerce/services/checkout";

const input = {
  attemptId: "a37e6d6e-3b0d-4f72-9e1a-9ca900dda143",
  country: "FR" as const,
  items: [
    {
      packId: "solo" as const,
      composition: { black: 1, gold: 0, silver: 0 },
      quantity: 1,
    },
  ],
};
const order = {
  id: "order-internal",
  checkout_attempt_id: input.attemptId,
  status: "creating_session",
  shipping_country: "FR",
  subtotal_cents: 3499,
  shipping_cents: 0,
  total_cents: 3499,
  stripe_expires_at: new Date(Date.now() + 31 * 60_000).toISOString(),
  stripe_client_secret: null,
  stripe_checkout_session_id: null,
  confirmation_token: "a37e6d6e-3b0d-4f72-9e1a-9ca900dda144",
  public_order_reference: "LZ-TEST123",
};
const createSession = vi.fn();
const retrieveSession = vi.fn();
const expireSession = vi.fn();

describe("checkout service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCommerceEnv).mockReturnValue({
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      STRIPE_MODE: "test",
    } as never);
    vi.mocked(reserveCheckout).mockResolvedValue(order as never);
    vi.mocked(getOrderItemSnapshots).mockResolvedValue([
      {
        quantity: 1,
        unit_quantity: 1,
        unit_price_cents: 3499,
        total_price_cents: 3499,
        packs: { code: "solo" },
        product_variants: { color: "black" },
        composition: { black: 1, gold: 0, silver: 0 },
      },
    ]);
    vi.mocked(getReservedFinishQuantities).mockResolvedValue({
      black: 1,
      gold: 0,
      silver: 0,
    });
    vi.mocked(stripeClient).mockReturnValue({
      checkout: {
        sessions: {
          create: createSession,
          retrieve: retrieveSession,
          expire: expireSession,
        },
      },
    } as never);
    createSession.mockResolvedValue({
      id: "cs_test_123",
      client_secret: "cs_secret_test",
      livemode: false,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    });
    vi.mocked(attachSession).mockResolvedValue(order as never);
    vi.mocked(getOrderByToken).mockResolvedValue(null);
  });

  it("creates a Stripe embedded-page session for the exact FR solo black German request", async () => {
    const result = await beginCheckout(input, "de");

    expect(result.quote.totalCents).toBe(3499);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        ui_mode: "embedded_page",
        locale: "de",
        mode: "payment",
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              currency: "eur",
              unit_amount: 3499,
            }),
          }),
        ],
      }),
      expect.any(Object),
    );
    expect(attachSession).toHaveBeenCalledOnce();
  });

  it("accepts a matching LIVE session when explicitly configured for LIVE", async () => {
    vi.mocked(requireCommerceEnv).mockReturnValue({
      NEXT_PUBLIC_SITE_URL: "https://shop.example.com",
      STRIPE_MODE: "live",
    } as never);
    createSession.mockResolvedValue({
      id: "cs_live_123",
      client_secret: "cs_secret_live",
      livemode: true,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    });

    await expect(beginCheckout(input, "fr")).resolves.toMatchObject({
      clientSecret: "cs_secret_live",
    });
    expect(createSession.mock.calls[0][0].return_url).toBe(
      `https://shop.example.com/fr/order/confirmation?token=${order.confirmation_token}&session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(attachSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["test", "cs_live_123", true],
    ["live", "cs_test_123", false],
  ] as const)(
    "does not attach a %s-configured checkout to a mismatched Stripe session",
    async (mode, id, livemode) => {
      vi.mocked(requireCommerceEnv).mockReturnValue({
        NEXT_PUBLIC_SITE_URL: "https://shop.example.com",
        STRIPE_MODE: mode,
      } as never);
      createSession.mockResolvedValue({
        id,
        client_secret: "cs_secret_example",
        livemode,
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      });

      await expect(beginCheckout(input, "fr")).rejects.toMatchObject({
        reason: "retry",
      });
      expect(attachSession).not.toHaveBeenCalled();
    },
  );

  it("does not classify a Supabase transport error as invalid checkout input", async () => {
    vi.mocked(reserveCheckout).mockRejectedValue(
      Object.assign(new Error("transport failure"), { code: "PGRST125" }),
    );
    await expect(beginCheckout(input, "de")).rejects.toMatchObject({
      reason: "retry",
    } satisfies Partial<CheckoutError>);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("sanitizes an inactive or unsupported database variant rejection", async () => {
    vi.mocked(reserveCheckout).mockRejectedValue(
      Object.assign(new Error("inactive_finish"), { code: "22023" }),
    );
    await expect(beginCheckout(input, "de")).rejects.toMatchObject({
      reason: "invalid",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("refuses a database/catalog price mismatch before creating any Stripe session", async () => {
    vi.mocked(getOrderItemSnapshots).mockResolvedValue([
      {
        quantity: 1,
        unit_quantity: 1,
        unit_price_cents: 1,
        total_price_cents: 1,
        packs: { code: "solo" },
        product_variants: { color: "black" },
        composition: { black: 1, gold: 0, silver: 0 },
      },
    ]);
    await expect(beginCheckout(input, "de")).rejects.toMatchObject({
      reason: "unavailable",
    } satisfies Partial<CheckoutError>);
    expect(failSession).toHaveBeenCalledWith(order.id);
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each(["FR", "BE", "DE", "CH"] as const)(
    "uses server shipping and locks Stripe to %s",
    async (country) => {
      vi.mocked(reserveCheckout).mockResolvedValue({
        ...order,
        shipping_country: country,
        shipping_cents: country === "FR" ? 0 : 1000,
        total_cents: country === "FR" ? 3499 : 4499,
      } as never);
      const result = await beginCheckout(
        { ...input, country, shippingCents: 1 } as never,
        "en",
      );
      expect(result.quote.shippingCents).toBe(country === "FR" ? 0 : 1000);
      expect(result.quote.totalCents).toBe(country === "FR" ? 3499 : 4499);
      expect(reserveCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ country, items: input.items }),
        expect.any(Date),
        "en",
      );
      expect(createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          shipping_address_collection: { allowed_countries: [country] },
          shipping_options: [
            {
              shipping_rate_data: expect.objectContaining({
                fixed_amount: {
                  amount: country === "FR" ? 0 : 1000,
                  currency: "eur",
                },
              }),
            },
          ],
          metadata: expect.objectContaining({ shipping_country: country }),
        }),
        expect.any(Object),
      );
    },
  );

  it("reconciles an expired DE attempt before permitting a fresh checkout", async () => {
    const oldSession = {
      id: "cs_test_old",
      livemode: false,
      status: "open",
      payment_status: "unpaid",
    };
    const expiredSession = {
      ...oldSession,
      status: "expired",
      currency: "eur",
      mode: "payment",
      amount_total: 4499,
    };
    vi.mocked(reserveCheckout).mockResolvedValue({
      ...order,
      status: "pending_payment",
      shipping_country: "DE",
      shipping_cents: 1000,
      total_cents: 4499,
      stripe_expires_at: new Date(Date.now() - 60_000).toISOString(),
      stripe_client_secret: "cs_secret_old",
      stripe_checkout_session_id: oldSession.id,
    } as never);
    retrieveSession.mockResolvedValue(oldSession);
    expireSession.mockResolvedValue(expiredSession);
    vi.mocked(processCurrentSession).mockResolvedValue("processed" as never);
    vi.mocked(getOrderByToken).mockResolvedValue({
      ...order,
      status: "expired",
    } as never);

    await expect(
      beginCheckout({ ...input, country: "DE" }, "fr"),
    ).rejects.toMatchObject({ reason: "expired" });
    expect(expireSession).toHaveBeenCalledWith(oldSession.id);
    expect(processCurrentSession).toHaveBeenCalledWith(
      expiredSession,
      "reconcile:cs_test_old:expired:unpaid",
      "reconcile",
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it("preserves an expired attempt when Stripe cannot confirm its state", async () => {
    vi.mocked(reserveCheckout).mockResolvedValue({
      ...order,
      status: "pending_payment",
      shipping_country: "DE",
      shipping_cents: 1000,
      total_cents: 4499,
      stripe_expires_at: new Date(Date.now() - 60_000).toISOString(),
      stripe_client_secret: "cs_secret_old",
      stripe_checkout_session_id: "cs_test_old",
    } as never);
    retrieveSession.mockRejectedValue(new Error("network"));
    await expect(
      beginCheckout({ ...input, country: "DE" }, "fr"),
    ).rejects.toMatchObject({ reason: "retry" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a database shipping mismatch before Stripe is created", async () => {
    vi.mocked(reserveCheckout).mockResolvedValue({
      ...order,
      shipping_country: "BE",
      shipping_cents: 0,
      total_cents: 3499,
    } as never);
    await expect(
      beginCheckout({ ...input, country: "BE" }, "fr"),
    ).rejects.toMatchObject({ reason: "unavailable" });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("charges exactly 69.99 EUR for one DUO shipped to Belgium", async () => {
    vi.mocked(getReservedFinishQuantities).mockResolvedValue({
      black: 2,
      gold: 0,
      silver: 0,
    });
    vi.mocked(reserveCheckout).mockResolvedValue({
      ...order,
      shipping_country: "BE",
      subtotal_cents: 5999,
      shipping_cents: 1000,
      total_cents: 6999,
    } as never);
    vi.mocked(getOrderItemSnapshots).mockResolvedValue([
      {
        quantity: 1,
        unit_quantity: 2,
        unit_price_cents: 5999,
        total_price_cents: 5999,
        packs: { code: "duo" },
        product_variants: { color: "black" },
        composition: { black: 2, gold: 0, silver: 0 },
      },
    ]);
    const result = await beginCheckout(
      {
        ...input,
        country: "BE",
        items: [
          {
            packId: "duo",
            composition: { black: 2, gold: 0, silver: 0 },
            quantity: 1,
          },
        ],
      },
      "fr",
    );
    expect(result.quote).toMatchObject({
      subtotalCents: 5999,
      shippingCents: 1000,
      totalCents: 6999,
    });
    const stripeInput = createSession.mock.calls[0][0];
    expect(stripeInput.line_items[0].price_data.unit_amount).toBe(5999);
    expect(
      stripeInput.shipping_options[0].shipping_rate_data.fixed_amount.amount,
    ).toBe(1000);
    expect(stripeInput.shipping_address_collection.allowed_countries).toEqual([
      "BE",
    ]);
  });

  it("charges a mixed PRO by pack price and verifies the durable composition", async () => {
    const composition = { black: 2, gold: 5, silver: 3 };
    vi.mocked(getReservedFinishQuantities).mockResolvedValue(composition);
    vi.mocked(reserveCheckout).mockResolvedValue({
      ...order,
      subtotal_cents: 24999,
      total_cents: 24999,
    } as never);
    vi.mocked(getOrderItemSnapshots).mockResolvedValue([
      {
        quantity: 1,
        unit_quantity: 10,
        unit_price_cents: 24999,
        total_price_cents: 24999,
        packs: { code: "pro" },
        product_variants: null,
        composition,
      },
    ]);
    const result = await beginCheckout(
      { ...input, items: [{ packId: "pro", composition, quantity: 1 }] },
      "en",
    );
    expect(result.quote.totalCents).toBe(24999);
    expect(createSession.mock.calls[0][0].line_items[0]).toMatchObject({
      quantity: 1,
      price_data: {
        unit_amount: 24999,
        product_data: { description: "2 black, 5 gold, 3 silver" },
      },
    });
    expect(reserveCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ packId: "pro", composition, quantity: 1 }],
      }),
      expect.any(Date),
      "en",
    );
  });

  it("rejects a mismatched database composition before Stripe", async () => {
    vi.mocked(getOrderItemSnapshots).mockResolvedValue([
      {
        quantity: 1,
        unit_quantity: 1,
        unit_price_cents: 3499,
        total_price_cents: 3499,
        packs: { code: "solo" },
        product_variants: null,
        composition: { black: 0, gold: 1, silver: 0 },
      },
    ]);
    await expect(beginCheckout(input, "fr")).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a database reservation allocation mismatch before Stripe", async () => {
    vi.mocked(getReservedFinishQuantities).mockResolvedValue({
      black: 0,
      gold: 1,
      silver: 0,
    });
    await expect(beginCheckout(input, "fr")).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(createSession).not.toHaveBeenCalled();
  });
});
