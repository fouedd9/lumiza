import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cache } from "react";

import { getCommerceEnv } from "@/config/commerce-env.server";

import { lumizaProduct } from "./product";
import {
  productColorSchema,
  productPackSchema,
} from "../schemas/product.schema";
import type { ProductColor, ProductPack } from "../types/product";

export type PurchaseCatalog = { packs: ProductPack[]; colors: ProductColor[] };

// Read-only display catalog. Checkout still reserves and verifies against the DB independently.
export const getPurchaseCatalog = cache(
  async (): Promise<PurchaseCatalog | null> => {
    const parsed = getCommerceEnv();
    if (!parsed.success) return null;
    try {
      const db = createClient(
        parsed.data.NEXT_PUBLIC_SUPABASE_URL,
        parsed.data.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      const { data: product, error: productError } = await db
        .from("products")
        .select("id")
        .eq("sku", lumizaProduct.sku)
        .eq("active", true)
        .maybeSingle();
      if (productError || !product) return null;
      const [packResult, variantResult] = await Promise.all([
        db
          .from("packs")
          .select("code,quantity,price_cents,currency")
          .eq("active", true)
          .eq("currency", "EUR"),
        db
          .from("product_variants")
          .select("color")
          .eq("product_id", product.id)
          .eq("active", true),
      ]);
      if (packResult.error || variantResult.error) return null;
      const packs = (packResult.data ?? [])
        .flatMap((row) => {
          const definition = lumizaProduct.packs.find(
            (pack) => pack.id === row.code,
          );
          const result = productPackSchema.safeParse({
            id: row.code,
            label: definition?.label,
            quantity: row.quantity,
            priceInCents: row.price_cents,
            currency: row.currency,
          });
          return result.success ? [result.data] : [];
        })
        .sort(
          (a, b) =>
            lumizaProduct.packs.findIndex((pack) => pack.id === a.id) -
            lumizaProduct.packs.findIndex((pack) => pack.id === b.id),
        );
      const colors = (variantResult.data ?? []).flatMap((row) => {
        const result = productColorSchema.safeParse(row.color);
        return result.success ? [result.data] : [];
      });
      return packs.length && colors.length ? { packs, colors } : null;
    } catch {
      return null;
    }
  },
);
