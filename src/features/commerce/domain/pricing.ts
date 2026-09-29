import { lumizaProduct } from "@/features/product/data/product";
import type { ProductPack } from "@/features/product/types/product";

import {
  cartSchema,
  FINISHES,
  type CartItem,
  type Composition,
} from "../schemas/cart";
import { shippingCents, type ShippingCountry } from "./shipping";

export { shippingCents } from "./shipping";
export type { ShippingCountry } from "./shipping";

export function quoteCart(
  items: CartItem[],
  country: ShippingCountry,
  packs: readonly ProductPack[],
) {
  const parsed = cartSchema.min(1).parse(items);
  const lines = parsed.map((item) => {
    const pack = packs.find((candidate) => candidate.id === item.packId);
    if (
      !pack ||
      FINISHES.some(
        (finish) =>
          item.composition[finish] > 0 &&
          !lumizaProduct.colors.includes(finish),
      )
    )
      throw new Error("Invalid selection");
    return {
      ...item,
      unitQuantity: pack.quantity,
      unitPriceCents: pack.priceInCents,
      totalPriceCents: pack.priceInCents * item.quantity,
      physicalQuantity: pack.quantity * item.quantity,
    };
  });
  const physicalQuantity = lines.reduce(
    (sum, line) => sum + line.physicalQuantity,
    0,
  );
  const finishQuantities: Composition = { black: 0, gold: 0, silver: 0 };
  for (const line of lines) {
    for (const finish of FINISHES) {
      finishQuantities[finish] += line.composition[finish] * line.quantity;
    }
  }
  if (physicalQuantity < 1 || physicalQuantity > 30)
    throw new Error("Invalid physical quantity");
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.totalPriceCents,
    0,
  );
  const shipping = shippingCents(country);
  return {
    lines,
    physicalQuantity,
    finishQuantities,
    subtotalCents,
    shippingCents: shipping,
    totalCents: subtotalCents + shipping,
  };
}
