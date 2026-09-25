"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { lumizaProduct } from "@/features/product/data/product";
import type { ProductPack } from "@/features/product/types/product";

import {
  cartSchema,
  FINISHES,
  solidComposition,
  type CartItem,
} from "../schemas/cart";
import { addToCart, canSaveCart } from "../domain/cart-display";

const KEY = "lumiza-cart-v2";
const LEGACY_KEY = "lumiza-cart-v1";
const EVENT = "lumiza-cart-changed";
let cachedRaw: string | null = null;
let cachedItems: CartItem[] = [];
const empty: CartItem[] = [];

function snapshot(): CartItem[] {
  const current = window.localStorage.getItem(KEY);
  const legacy =
    current === null ? window.localStorage.getItem(LEGACY_KEY) : null;
  const raw = current ?? legacy;
  const cacheKey = `${current === null ? "legacy" : "current"}:${raw}`;
  if (cacheKey === cachedRaw) return cachedItems;
  cachedRaw = cacheKey;
  try {
    if (current !== null) {
      const parsed = cartSchema.safeParse(JSON.parse(current));
      cachedItems = parsed.success ? parsed.data : [];
    } else if (legacy !== null) {
      const parsed = z
        .array(
          z
            .object({
              packId: z.enum(["solo", "duo", "pro"]),
              color: z.enum(FINISHES),
              quantity: z.number().int().min(1).max(10),
            })
            .strict(),
        )
        .max(10)
        .safeParse(JSON.parse(legacy));
      const migrated = parsed.success
        ? parsed.data.map((item) => {
            const pack = lumizaProduct.packs.find(
              (entry) => entry.id === item.packId,
            )!;
            return {
              packId: item.packId,
              composition: solidComposition(item.color, pack.quantity),
              quantity: item.quantity,
            };
          })
        : [];
      const valid = cartSchema.safeParse(migrated);
      cachedItems = valid.success && canSaveCart(valid.data) ? valid.data : [];
      if (valid.success && parsed.success && canSaveCart(valid.data)) {
        window.localStorage.setItem(KEY, JSON.stringify(valid.data));
        cachedRaw = `current:${JSON.stringify(valid.data)}`;
      }
    } else cachedItems = [];
  } catch {
    cachedItems = [];
  }
  return cachedItems;
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useCart() {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}

export function saveCart(
  items: CartItem[],
  packs: readonly ProductPack[] = lumizaProduct.packs,
) {
  const parsed = cartSchema.parse(items);
  if (!canSaveCart(parsed, packs)) return false;
  window.localStorage.setItem(KEY, JSON.stringify(parsed));
  window.dispatchEvent(new Event(EVENT));
  return true;
}

export function addCartItem(
  item: CartItem,
  packs: readonly ProductPack[] = lumizaProduct.packs,
) {
  const next = addToCart(snapshot(), [item], packs);
  return next ? saveCart(next, packs) : false;
}
