import { describe, expect, it } from "vitest";

import { lumizaProduct } from "@/features/product/data/product";
import { getPackSavingsInCents } from "@/features/product/data/pricing";
import { productSchema } from "@/features/product/schemas/product.schema";

describe("LUMIZA catalogue", () => {
  it("contains the three expected packs and integer-cent prices", () => {
    expect(lumizaProduct.packs).toEqual([
      expect.objectContaining({ id: "solo", quantity: 1, priceInCents: 3499 }),
      expect.objectContaining({ id: "duo", quantity: 2, priceInCents: 5999 }),
      expect.objectContaining({ id: "pro", quantity: 10, priceInCents: 24999 }),
    ]);

    expect(
      lumizaProduct.packs.every((pack) => Number.isInteger(pack.priceInCents)),
    ).toBe(true);
  });

  it("validates the local product source", () => {
    expect(productSchema.safeParse(lumizaProduct).success).toBe(true);
  });

  it("rejects a floating-point cent price", () => {
    const invalidProduct = structuredClone(lumizaProduct);
    invalidProduct.packs[0].priceInCents = 34.99;

    expect(productSchema.safeParse(invalidProduct).success).toBe(false);
  });

  it("calculates DUO and PRO savings from the SOLO unit price", () => {
    const [solo, duo, pro] = lumizaProduct.packs;

    expect(getPackSavingsInCents(duo, solo.priceInCents)).toBe(999);
    expect(getPackSavingsInCents(pro, solo.priceInCents)).toBe(9991);
  });
});
