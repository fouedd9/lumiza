"use client";

import { useState, type MouseEvent } from "react";

import { openCart } from "@/features/commerce/components/cart-drawer-state";
import {
  addCartItem,
  useCart,
} from "@/features/commerce/components/cart-store";
import {
  physicalLampCount,
  MAX_LAMPS,
} from "@/features/commerce/domain/cart-display";
import {
  cartLineKey,
  FINISHES,
  type Composition,
} from "@/features/commerce/schemas/cart";
import type { AppLocale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/utils/format-currency";

import type { ResolvedProductMedia } from "../data/product-media";
import type { PurchaseCatalog } from "../data/purchase-catalog.server";
import type { ProductColor, ProductPack } from "../types/product";
import { PackSelector, type PackLabels } from "./pack-selector";
import { ProductColors } from "./product-colors";
import { ProductGallery } from "./product-gallery";

export type PurchaseLabels = {
  brand: string;
  name: string;
  description: string;
  color: string;
  selected: string;
  quantity: string;
  increase: string;
  decrease: string;
  finishIncrease: string;
  finishDecrease: string;
  add: string;
  max: string;
  unavailable: string;
  compose: string;
  composeSuffix: string;
  selectedCount: string;
  remainingSingle: string;
  remainingPlural: string;
  gallery: {
    gallery: string;
    previous: string;
    next: string;
    expand: string;
    close: string;
  };
  colors: Record<ProductColor, string>;
  packs: PackLabels;
};

export function PurchaseExperience({
  locale,
  media,
  catalog,
  labels,
}: {
  locale: AppLocale;
  media: ResolvedProductMedia[];
  catalog: PurchaseCatalog | null;
  labels: PurchaseLabels;
}) {
  const [activeId, setActiveId] = useState(
    media.find((item) => item.color === catalog?.colors[0])?.id ?? media[0].id,
  );
  const [composition, setComposition] = useState<Composition>({
    black: 0,
    gold: 0,
    silver: 0,
  });
  const [selectedColor, setSelectedColor] = useState<ProductColor | null>(null);
  const [selectedPack, setSelectedPack] = useState<ProductPack["id"]>(
    catalog?.packs[0]?.id ?? "solo",
  );
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState(false);
  const items = useCart();
  const pack = catalog?.packs.find((entry) => entry.id === selectedPack);
  const selectedLamps = FINISHES.reduce(
    (sum, finish) => sum + composition[finish],
    0,
  );
  const complete = !!pack && selectedLamps === pack.quantity;
  const existingQuantity =
    items.find(
      (item) =>
        item.packId === selectedPack &&
        cartLineKey(item) ===
          cartLineKey({ packId: selectedPack, composition }),
    )?.quantity ?? 0;
  const remainingLamps = MAX_LAMPS - physicalLampCount(items, catalog?.packs);
  const maxAddQuantity = pack
    ? Math.max(
        0,
        Math.min(
          10 - existingQuantity,
          Math.floor(remainingLamps / pack.quantity),
        ),
      )
    : 0;
  const effectiveQuantity = Math.min(quantity, maxAddQuantity);

  function changeColor(color: ProductColor) {
    setSelectedColor(color);
    setComposition({
      black: color === "black" ? 1 : 0,
      gold: color === "gold" ? 1 : 0,
      silver: color === "silver" ? 1 : 0,
    });
    setQuantity(1);
    setError(false);
    const matching = media.find((item) => item.color === color);
    if (matching) setActiveId(matching.id);
  }

  function changeMedia(id: string) {
    setActiveId(id);
    const color = media.find((item) => item.id === id)?.color;
    if (selectedPack === "solo" && color && catalog?.colors.includes(color))
      changeColor(color);
  }

  function changeFinishCount(color: ProductColor, delta: number) {
    const next = composition[color] + delta;
    if (
      !pack ||
      next < 0 ||
      next > pack.quantity ||
      selectedLamps + delta > pack.quantity
    )
      return;
    setComposition({ ...composition, [color]: next });
    setQuantity(1);
    setError(false);
    if (delta > 0) {
      const matching = media.find((item) => item.color === color);
      if (matching) setActiveId(matching.id);
    }
  }

  function add(event: MouseEvent<HTMLButtonElement>) {
    if (
      !pack ||
      effectiveQuantity < 1 ||
      !catalog ||
      !complete ||
      FINISHES.some(
        (finish) => composition[finish] > 0 && !catalog.colors.includes(finish),
      )
    )
      return;
    if (
      !addCartItem(
        {
          packId: pack.id,
          composition,
          quantity: effectiveQuantity,
        },
        catalog.packs,
      )
    ) {
      setError(true);
      return;
    }
    setQuantity(1);
    setError(false);
    openCart(event.currentTarget);
  }

  return (
    <div className="grid min-w-0 items-start gap-9 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14">
      <div className="min-w-0">
        <ProductGallery
          media={media}
          activeId={activeId}
          onActiveChange={changeMedia}
          labels={labels.gallery}
        />
      </div>
      <div className="min-w-0 lg:pt-2">
        <p className="text-primary text-xs font-extrabold tracking-[0.2em] uppercase">
          {labels.brand}
        </p>
        <h2 className="font-display mt-3 text-[clamp(2.2rem,4vw,4.25rem)] leading-[1.02] font-extrabold tracking-[-0.055em]">
          {labels.name}
        </h2>
        <p className="text-muted-foreground mt-5 max-w-xl leading-7">
          {labels.description}
        </p>
        {pack ? (
          <p
            aria-live="polite"
            className="font-display border-border mt-7 border-b pb-6 text-3xl font-extrabold tracking-[-0.04em]"
          >
            {formatCurrency(pack.priceInCents, "EUR", locale)}
          </p>
        ) : null}
        {!catalog ? (
          <p role="status" className="text-muted-foreground mt-7">
            {labels.unavailable}
          </p>
        ) : (
          <div className="mt-7 space-y-8">
            <PackSelector
              packs={catalog.packs}
              selected={selectedPack}
              onChange={(id) => {
                setSelectedPack(id);
                setComposition({ black: 0, gold: 0, silver: 0 });
                setSelectedColor(null);
                setQuantity(1);
                setError(false);
              }}
              locale={locale}
              labels={labels.packs}
            />
            {selectedPack === "solo" ? (
              <ProductColors
                colors={catalog.colors}
                selected={selectedColor}
                onChange={changeColor}
                labels={labels.colors}
                legend={labels.color}
                provisionalLabel=""
              />
            ) : (
              <fieldset>
                <legend className="mb-3 font-bold">
                  {labels.compose} {pack?.quantity ?? 0} {labels.composeSuffix}
                </legend>
                <div className="space-y-2">
                  {catalog.colors.map((color) => (
                    <div
                      key={color}
                      className="border-border bg-surface-elevated flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2"
                    >
                      <span
                        className={`color-swatch color-swatch-${color}`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 font-semibold">
                        {labels.colors[color]}
                      </span>
                      <button
                        type="button"
                        disabled={composition[color] === 0}
                        onClick={() => changeFinishCount(color, -1)}
                        aria-label={`${labels.finishDecrease} ${labels.colors[color]}`}
                        className="grid size-11 place-items-center rounded-full border disabled:opacity-40"
                      >
                        −
                      </button>
                      <span
                        className="w-5 text-center font-bold"
                        aria-live="polite"
                      >
                        {composition[color]}
                      </span>
                      <button
                        type="button"
                        disabled={selectedLamps >= (pack?.quantity ?? 0)}
                        onClick={() => changeFinishCount(color, 1)}
                        aria-label={`${labels.finishIncrease} ${labels.colors[color]}`}
                        className="grid size-11 place-items-center rounded-full border disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
            <p
              role="status"
              aria-live="polite"
              className="text-muted-foreground text-sm font-semibold"
            >
              {selectedLamps} / {pack?.quantity ?? 0} {labels.selectedCount}
              {!complete
                ? ` · ${(pack?.quantity ?? 0) - selectedLamps} ${(pack?.quantity ?? 0) - selectedLamps === 1 ? labels.remainingSingle : labels.remainingPlural}`
                : ""}
            </p>
            <div>
              <p className="mb-3 font-bold">{labels.quantity}</p>
              <div className="border-border inline-flex items-center rounded-full border">
                <button
                  type="button"
                  disabled={effectiveQuantity <= 1}
                  onClick={() =>
                    setQuantity(Math.max(1, effectiveQuantity - 1))
                  }
                  aria-label={labels.decrease}
                  className="focus-visible:outline-primary grid size-11 place-items-center rounded-full text-xl focus-visible:outline-2 disabled:opacity-40"
                >
                  −
                </button>
                <span
                  className="min-w-9 text-center font-bold"
                  aria-live="polite"
                >
                  {effectiveQuantity || 0}
                </span>
                <button
                  type="button"
                  disabled={effectiveQuantity >= maxAddQuantity}
                  onClick={() => setQuantity(effectiveQuantity + 1)}
                  aria-label={labels.increase}
                  className="focus-visible:outline-primary grid size-11 place-items-center rounded-full text-xl focus-visible:outline-2 disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
            <button
              data-add-to-cart
              type="button"
              disabled={!complete || effectiveQuantity < 1}
              onClick={add}
              className="bg-primary text-primary-foreground focus-visible:outline-foreground flex min-h-14 w-full items-center justify-center rounded-full px-6 text-base font-extrabold transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {labels.add}
              {pack && effectiveQuantity
                ? ` — ${formatCurrency(pack.priceInCents * effectiveQuantity, "EUR", locale)}`
                : ""}
            </button>
            {error || maxAddQuantity === 0 ? (
              <p role="alert" className="text-primary text-sm font-semibold">
                {labels.max}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
