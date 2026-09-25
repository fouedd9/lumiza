import { beforeEach, describe, expect, it } from "vitest";

import {
  addCartItem,
  saveCart,
} from "@/features/commerce/components/cart-store";
import {
  addToCart,
  cartDisplaySubtotal,
  cartItemCount,
  physicalLampCount,
  setCartLineQuantity,
} from "@/features/commerce/domain/cart-display";
import { lumizaProduct } from "@/features/product/data/product";

const soloBlack = {
  packId: "solo" as const,
  composition: { black: 1, gold: 0, silver: 0 },
  quantity: 1,
};
const duoGold = {
  packId: "duo" as const,
  composition: { black: 0, gold: 2, silver: 0 },
  quantity: 1,
};
const proSilver = {
  packId: "pro" as const,
  composition: { black: 0, gold: 0, silver: 10 },
  quantity: 1,
};

describe("display-only cart", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps SOLO, DUO and PRO selections, variants and packs distinct", () => {
    const items = addToCart([], [soloBlack, duoGold, proSilver])!;
    expect(items.map((item) => item.packId)).toEqual(["solo", "duo", "pro"]);
    expect(physicalLampCount(items)).toBe(13);
    expect(
      addToCart(items, [
        { ...soloBlack, composition: { black: 0, gold: 1, silver: 0 } },
      ]),
    ).toHaveLength(4);
    expect(
      addToCart(items, [
        { ...duoGold, composition: { black: 1, gold: 1, silver: 0 } },
      ]),
    ).toHaveLength(4);
  });

  it("increments an identical line and calculates display subtotal from catalog prices", () => {
    const items = addToCart([soloBlack], [soloBlack, duoGold])!;
    expect(items).toEqual([{ ...soloBlack, quantity: 2 }, duoGold]);
    expect(cartItemCount(items)).toBe(3);
    expect(cartDisplaySubtotal(items, lumizaProduct.packs)).toBe(
      2 * 3499 + 5999,
    );
    expect(physicalLampCount(items)).toBe(4);
  });

  it("merges equivalent mixed compositions independent of key order but keeps different ones separate", () => {
    const mixed = {
      packId: "duo" as const,
      composition: { black: 0, gold: 1, silver: 1 },
      quantity: 1,
    };
    const reordered = {
      packId: "duo" as const,
      composition: { silver: 1, black: 0, gold: 1 },
      quantity: 1,
    };
    const solid = {
      packId: "duo" as const,
      composition: { black: 0, gold: 2, silver: 0 },
      quantity: 1,
    };
    expect(addToCart([mixed], [reordered, solid])).toEqual([
      { ...mixed, quantity: 2 },
      solid,
    ]);
    expect(setCartLineQuantity([mixed, solid], mixed, 2)).toEqual([
      { ...mixed, quantity: 2 },
      solid,
    ]);
  });

  it("prevents more than 30 physical lamps and more than 10 packs per line", () => {
    const threePro = { ...proSilver, quantity: 3 };
    expect(addToCart([threePro], [soloBlack])).toBeNull();
    expect(setCartLineQuantity([threePro], threePro, 4)).toBeNull();
    expect(addToCart([{ ...soloBlack, quantity: 10 }], [soloBlack])).toBeNull();
    expect(addToCart([proSilver], [{ ...proSilver, quantity: 2 }])).toEqual([
      { ...proSilver, quantity: 3 },
    ]);
  });

  it("persists only identity and quantity, never browser-supplied prices", () => {
    expect(saveCart([soloBlack])).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("lumiza-cart-v2")!)).toEqual([
      soloBlack,
    ]);
    expect(addCartItem(soloBlack)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("lumiza-cart-v2")!)).toEqual([
      { ...soloBlack, quantity: 2 },
    ]);
  });
});
