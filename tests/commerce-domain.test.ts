import { describe, expect, it } from "vitest";

import {
  quoteCart as quoteCartWithPacks,
  shippingCents,
} from "@/features/commerce/domain/pricing";
import {
  packsFromSnapshots,
  snapshotsMatchQuote,
} from "@/features/commerce/domain/catalog-guard";
import { lumizaProduct } from "@/features/product/data/product";
import { publicPaymentState } from "@/features/commerce/domain/states";
import {
  cartItemSchema,
  checkoutRequestSchema,
  compositionKey,
  solidComposition,
} from "@/features/commerce/schemas/cart";
import {
  ENABLED_COUNTRIES,
  isShippingCountry,
} from "@/features/commerce/domain/shipping";

const attemptId = "a37e6d6e-3b0d-4f72-9e1a-9ca900dda143";
const quoteCart = (
  items: Parameters<typeof quoteCartWithPacks>[0],
  country: Parameters<typeof quoteCartWithPacks>[1],
) => quoteCartWithPacks(items, country, lumizaProduct.packs);
const solid = (
  packId: "solo" | "duo" | "pro",
  color: "black" | "gold" | "silver",
  quantity = 1,
) => {
  const size = { solo: 1, duo: 2, pro: 10 }[packId];
  return {
    packId,
    composition: {
      black: color === "black" ? size : 0,
      gold: color === "gold" ? size : 0,
      silver: color === "silver" ? size : 0,
    },
    quantity,
  };
};

describe("checkout domain", () => {
  it("accepts mixed DUO and PRO compositions without changing pack prices", () => {
    const quote = quoteCart(
      [
        {
          packId: "duo",
          composition: { gold: 1, silver: 1, black: 0 },
          quantity: 1,
        },
        {
          packId: "pro",
          composition: { gold: 5, silver: 3, black: 2 },
          quantity: 2,
        },
      ],
      "FR",
    );
    expect(quote.physicalQuantity).toBe(22);
    expect(quote.finishQuantities).toEqual({ black: 4, gold: 11, silver: 7 });
    expect(quote.subtotalCents).toBe(5999 + 2 * 24999);
    expect(quote.shippingCents).toBe(0);
    expect(
      quoteCart(
        [
          {
            packId: "pro",
            composition: { black: 0, gold: 5, silver: 5 },
            quantity: 1,
          },
        ],
        "CH",
      ).totalCents,
    ).toBe(25999);
    expect(compositionKey({ black: 0, gold: 1, silver: 1 })).toBe(
      compositionKey({ silver: 1, gold: 1, black: 0 }),
    );
  });

  it("derives historical single-finish order compositions deterministically", () => {
    expect(solidComposition("gold", 10)).toEqual({
      black: 0,
      gold: 10,
      silver: 0,
    });
    expect(solidComposition("silver", 2)).toEqual({
      black: 0,
      gold: 0,
      silver: 2,
    });
  });

  it.each([
    { packId: "duo", composition: { gold: 2, silver: 1 } },
    { packId: "pro", composition: { gold: 10, silver: 10, black: 10 } },
    { packId: "pro", composition: { gold: -1, silver: 6, black: 5 } },
    { packId: "duo", composition: { gold: 1, blue: 1 } },
    { packId: "duo", composition: { gold: 0.5, silver: 1.5 } },
    { packId: "duo", composition: {} },
    { packId: "solo", composition: { black: 0, gold: 0, silver: 0 } },
  ])("rejects malformed pack composition %#", (item) => {
    expect(cartItemSchema.safeParse({ ...item, quantity: 1 }).success).toBe(
      false,
    );
  });

  it("rejects oversized pack counts and normalizes omitted zero finishes", () => {
    expect(
      cartItemSchema.safeParse({
        packId: "pro",
        composition: { gold: 10 },
        quantity: 1000000,
      }).success,
    ).toBe(false);
    expect(
      cartItemSchema.parse({
        packId: "duo",
        composition: { gold: 1, silver: 1 },
        quantity: 1,
      }).composition,
    ).toEqual({ black: 0, gold: 1, silver: 1 });
  });
  it("charges shipping once and counts physical units across mixed packs", () => {
    const quote = quoteCart(
      [solid("solo", "black"), solid("duo", "gold", 2), solid("pro", "silver")],
      "DE",
    );
    expect(quote.physicalQuantity).toBe(15);
    expect(quote.subtotalCents).toBe(3499 + 2 * 5999 + 24999);
    expect(quote.shippingCents).toBe(1000);
    expect(quote.totalCents).toBe(quote.subtotalCents + 1000);
    expect(Number.isInteger(quote.totalCents)).toBe(true);
    expect(shippingCents("FR")).toBe(0);
    expect(shippingCents("BE")).toBe(1000);
    expect(shippingCents("DE")).toBe(1000);
    expect(shippingCents("CH")).toBe(1000);
    expect(quoteCart([solid("duo", "black")], "FR").totalCents).toBe(5999);
    expect(quoteCart([solid("duo", "black")], "DE").totalCents).toBe(6999);
    expect(quoteCart([solid("duo", "black", 2)], "BE").totalCents).toBe(12998);
    expect(
      quoteCart([solid("solo", "black"), solid("duo", "gold")], "BE")
        .totalCents,
    ).toBe(10498);
    expect(quoteCart([solid("pro", "black")], "CH").totalCents).toBe(25999);
  });

  it("rejects invalid countries, packs, quantities and duplicated lines", () => {
    const valid = {
      attemptId,
      country: "FR",
      items: [solid("solo", "black")],
    };
    expect(checkoutRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      checkoutRequestSchema.safeParse({ ...valid, country: "GB" }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({
        ...valid,
        items: [{ ...valid.items[0], packId: "fake" }],
      }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({
        ...valid,
        items: [{ ...valid.items[0], quantity: 31 }],
      }).success,
    ).toBe(false);
    expect(
      checkoutRequestSchema.safeParse({
        ...valid,
        items: [valid.items[0], valid.items[0]],
      }).success,
    ).toBe(false);
    const withForgedPrice = checkoutRequestSchema.parse({
      ...valid,
      priceCents: 1,
      shippingCents: 1,
      totalCents: 1,
      items: [valid.items[0]],
    });
    expect(withForgedPrice).toEqual(valid);
    for (const country of ["ES", "IT", "NL", "GB", "ZZ"]) {
      expect(
        checkoutRequestSchema.safeParse({ ...valid, country }).success,
      ).toBe(false);
      expect(isShippingCountry(country)).toBe(false);
    }
    expect(isShippingCountry("CH")).toBe(true);
    expect(isShippingCountry("GB")).toBe(false);
    expect(ENABLED_COUNTRIES).toEqual(["FR", "BE", "DE", "CH"]);
    expect(() => quoteCart([solid("pro", "black", 4)], "FR")).toThrow();
  });

  it("never maps an in-flight order to paid", () => {
    expect(publicPaymentState("payment_processing")).toBe("pending");
    expect(publicPaymentState("session_unknown")).toBe("pending");
    expect(publicPaymentState("paid")).toBe("paid");
    expect(publicPaymentState("expired")).toBe("failed");
  });

  it("rejects catalogue drift before a Stripe session can be created", () => {
    const quote = quoteCart([solid("duo", "gold")], "FR");
    const snapshot = {
      quantity: 1,
      unit_quantity: 2,
      unit_price_cents: 5999,
      total_price_cents: 5999,
      packs: { code: "duo" },
      composition: { black: 0, gold: 2, silver: 0 },
    };
    expect(snapshotsMatchQuote([snapshot], quote)).toBe(true);
    expect(
      snapshotsMatchQuote([{ ...snapshot, unit_quantity: 1 }], quote),
    ).toBe(false);
    expect(
      snapshotsMatchQuote([{ ...snapshot, unit_price_cents: 5998 }], quote),
    ).toBe(false);
  });

  it("quotes an order from its immutable snapshot, not changed launch defaults", () => {
    const snapshot = {
      quantity: 1,
      unit_quantity: 1,
      unit_price_cents: 4499,
      total_price_cents: 4499,
      packs: { code: "solo" },
      composition: { black: 1, gold: 0, silver: 0 },
    };
    const packs = packsFromSnapshots([snapshot], lumizaProduct.packs);
    expect(
      quoteCartWithPacks([solid("solo", "black")], "FR", packs).totalCents,
    ).toBe(4499);
    expect(
      snapshotsMatchQuote(
        [snapshot],
        quoteCartWithPacks([solid("solo", "black")], "FR", packs),
      ),
    ).toBe(true);

    const historical = {
      ...snapshot,
      unit_price_cents: 3499,
      total_price_cents: 3499,
    };
    expect(packsFromSnapshots([historical], packs)[0].priceInCents).toBe(3499);
    expect(historical.unit_price_cents).toBe(3499);
    expect(() =>
      packsFromSnapshots([{ ...snapshot, unit_price_cents: -1 }], packs),
    ).toThrow();
  });
});
