"use client";

import { useState } from "react";

import { formatCurrency } from "@/lib/utils/format-currency";
import type {
  ProductPack,
  ProductColor,
} from "@/features/product/types/product";
import type { AppLocale } from "@/i18n/routing";

import { addCartItem, saveCart, useCart } from "./cart-store";
import { cartLineKey, FINISHES } from "../schemas/cart";

type Labels = {
  add: string;
  cart: string;
  empty: string;
  checkout: string;
  remove: string;
  quantity: string;
  color: string;
  subtotal: string;
  max: string;
  colors: Record<ProductColor, string>;
};

export function CartShop({
  packs,
  locale,
  labels,
}: {
  packs: ProductPack[];
  locale: AppLocale;
  labels: Labels;
}) {
  const items = useCart();
  const [colors, setColors] = useState<Record<string, ProductColor>>({
    solo: "black",
    duo: "black",
    pro: "black",
  });
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      (packs.find((pack) => pack.id === item.packId)?.priceInCents ?? 0) *
        item.quantity,
    0,
  );
  return (
    <div
      id="cart"
      className="mt-8 rounded-[1.75rem] border border-white/20 bg-white/5 p-6 text-white sm:p-8"
    >
      <h3 className="font-display text-2xl font-extrabold">{labels.cart}</h3>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {packs.map((pack) => (
          <div key={pack.id} className="rounded-2xl border border-white/15 p-4">
            <p className="font-bold">
              {pack.label} · {formatCurrency(pack.priceInCents, "EUR", locale)}
            </p>
            <label className="mt-3 block text-sm" htmlFor={`color-${pack.id}`}>
              {labels.color}
            </label>
            <select
              id={`color-${pack.id}`}
              value={colors[pack.id]}
              onChange={(event) =>
                setColors({
                  ...colors,
                  [pack.id]: event.target.value as ProductColor,
                })
              }
              className="mt-1 w-full rounded-lg border border-white/30 bg-[#262626] p-2 text-white"
            >
              {(["black", "gold", "silver"] as const).map((color) => (
                <option key={color} value={color}>
                  {labels.colors[color]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bg-primary text-primary-foreground mt-4 min-h-11 w-full rounded-full px-4 font-bold"
              onClick={() =>
                addCartItem({
                  packId: pack.id,
                  composition: {
                    black: colors[pack.id] === "black" ? pack.quantity : 0,
                    gold: colors[pack.id] === "gold" ? pack.quantity : 0,
                    silver: colors[pack.id] === "silver" ? pack.quantity : 0,
                  },
                  quantity: 1,
                })
              }
            >
              {labels.add}
            </button>
          </div>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-white/70">{labels.empty}</p>
      ) : (
        <div className="mt-8">
          <ul className="space-y-3">
            {items.map((item) => {
              const pack = packs.find((entry) => entry.id === item.packId)!;
              return (
                <li
                  key={cartLineKey(item)}
                  className="grid gap-3 rounded-xl border border-white/15 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <span>
                    {pack.label} ·{" "}
                    {FINISHES.filter((finish) => item.composition[finish] > 0)
                      .map(
                        (finish) =>
                          `${item.composition[finish]} × ${labels.colors[finish]}`,
                      )
                      .join(", ")}{" "}
                    ·{" "}
                    {formatCurrency(
                      pack.priceInCents * item.quantity,
                      "EUR",
                      locale,
                    )}
                  </span>
                  <label className="flex items-center gap-2">
                    {labels.quantity}
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={item.quantity}
                      aria-label={`${pack.label} ${labels.quantity}`}
                      className="w-16 rounded-lg border border-white/30 bg-[#262626] p-2 text-white"
                      onChange={(event) => {
                        const quantity = Number(event.target.value);
                        if (
                          Number.isInteger(quantity) &&
                          quantity >= 1 &&
                          quantity <= 10
                        )
                          saveCart(
                            items.map((entry) =>
                              entry === item ? { ...entry, quantity } : entry,
                            ),
                          );
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="min-h-11 underline"
                    onClick={() =>
                      saveCart(items.filter((entry) => entry !== item))
                    }
                  >
                    {labels.remove}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="font-bold">
              {labels.subtotal}: {formatCurrency(subtotal, "EUR", locale)}
            </p>
            <a
              href={`/${locale}/checkout`}
              className="bg-accent text-accent-foreground inline-flex min-h-11 items-center rounded-full px-6 font-bold"
            >
              {labels.checkout} →
            </a>
          </div>
          <p className="mt-3 text-sm text-white/60">{labels.max}</p>
        </div>
      )}
    </div>
  );
}
