import { lumizaProduct } from "@/features/product/data/product";
import type { ProductPack } from "@/features/product/types/product";

import { cartLineKey, cartSchema, type CartItem } from "../schemas/cart";

export const MAX_LAMPS = 30;

export function physicalLampCount(
  items: CartItem[],
  packs: readonly ProductPack[] = lumizaProduct.packs,
) {
  return items.reduce(
    (sum, item) =>
      sum +
      (packs.find((pack) => pack.id === item.packId)?.quantity ?? 0) *
        item.quantity,
    0,
  );
}

export function cartDisplaySubtotal(
  items: CartItem[],
  packs: readonly ProductPack[],
) {
  return items.reduce(
    (sum, item) =>
      sum +
      (packs.find((pack) => pack.id === item.packId)?.priceInCents ?? 0) *
        item.quantity,
    0,
  );
}

export function cartItemCount(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function canSaveCart(
  items: CartItem[],
  packs: readonly ProductPack[] = lumizaProduct.packs,
) {
  return (
    cartSchema.safeParse(items).success &&
    physicalLampCount(items, packs) <= MAX_LAMPS
  );
}

export function addToCart(
  items: CartItem[],
  incoming: CartItem[],
  packs: readonly ProductPack[] = lumizaProduct.packs,
): CartItem[] | null {
  const next = [...items];
  for (const item of incoming) {
    const index = next.findIndex(
      (entry) => cartLineKey(entry) === cartLineKey(item),
    );
    if (index === -1) next.push(item);
    else
      next[index] = {
        ...next[index],
        quantity: next[index].quantity + item.quantity,
      };
  }
  return canSaveCart(next, packs) ? next : null;
}

export function setCartLineQuantity(
  items: CartItem[],
  target: CartItem,
  quantity: number,
  packs: readonly ProductPack[] = lumizaProduct.packs,
): CartItem[] | null {
  const next = items.map((item) =>
    cartLineKey(item) === cartLineKey(target) ? { ...item, quantity } : item,
  );
  return canSaveCart(next, packs) ? next : null;
}
