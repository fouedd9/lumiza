import type { ProductPack } from "../types/product";

export function getPackSavingsInCents(
  pack: ProductPack,
  soloPriceInCents: number,
): number {
  return Math.max(0, soloPriceInCents * pack.quantity - pack.priceInCents);
}
