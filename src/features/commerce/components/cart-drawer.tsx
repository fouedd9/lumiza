"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { productMedia } from "@/features/product/data/product-media";
import type {
  ProductColor,
  ProductPack,
} from "@/features/product/types/product";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/utils/format-currency";
import { cartLineKey, FINISHES } from "../schemas/cart";

import {
  cartDisplaySubtotal,
  cartItemCount,
  setCartLineQuantity,
} from "../domain/cart-display";
import { closeCart, openCart, useCartDrawerOpen } from "./cart-drawer-state";
import { saveCart, useCart } from "./cart-store";

export type CartLabels = {
  title: string;
  open: string;
  close: string;
  empty: string;
  continue: string;
  checkout: string;
  remove: string;
  subtotal: string;
  shipping: string;
  nextStep: string;
  max: string;
  increase: string;
  decrease: string;
  lamp: string;
  lamps: string;
  perPack: string;
  unavailable: string;
  composition: string;
  packsLabel: string;
  colors: Record<ProductColor, string>;
};

export function CartButton({
  locale,
  packs,
  labels,
}: {
  locale: AppLocale;
  packs: readonly ProductPack[];
  labels: CartLabels;
}) {
  const items = useCart();
  const count = cartItemCount(items);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => openCart(buttonRef.current)}
        aria-label={`${labels.open}${count ? ` (${count})` : ""}`}
        className="border-border bg-surface-elevated focus-visible:outline-primary relative grid size-11 shrink-0 place-items-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-5"
        >
          <path d="M4 7h16l-1.5 12h-13L4 7Z" />
          <path d="M9 9V6a3 3 0 0 1 6 0v3" />
        </svg>
        {count > 0 ? (
          <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-[0.65rem] font-bold">
            {count}
          </span>
        ) : null}
      </button>
      <CartDrawer locale={locale} packs={packs} labels={labels} />
    </>
  );
}

export function CartDrawer({
  locale,
  packs,
  labels,
}: {
  locale: AppLocale;
  packs: readonly ProductPack[];
  labels: CartLabels;
}) {
  const open = useCartDrawerOpen();
  const items = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCart();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input:not([disabled])",
        ),
      );
      if (!focusables.length) return;
      const first = focusables[0],
        last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function changeQuantity(item: (typeof items)[number], quantity: number) {
    const next = setCartLineQuantity(items, item, quantity, packs);
    if (!next || !saveCart(next, packs)) {
      setLimitReached(true);
      return;
    }
    setLimitReached(false);
  }

  if (!open || typeof document === "undefined") return null;
  const subtotal = cartDisplaySubtotal(items, packs);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        type="button"
        aria-label={labels.close}
        onClick={closeCart}
        className="absolute inset-0 bg-black/55"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="bg-background text-foreground relative flex h-full w-full flex-col shadow-2xl sm:max-w-[30rem]"
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-5 sm:px-7">
          <h2
            id="cart-drawer-title"
            className="font-display text-2xl font-extrabold"
          >
            {labels.title}
            {items.length ? ` (${cartItemCount(items)})` : ""}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={closeCart}
            aria-label={labels.close}
            className="focus-visible:outline-primary grid size-11 place-items-center rounded-full text-2xl focus-visible:outline-2"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {!items.length ? (
            <p className="text-muted-foreground">{labels.empty}</p>
          ) : (
            <ul className="space-y-6">
              {items.map((item) => {
                const pack = packs.find((entry) => entry.id === item.packId);
                const finishes = FINISHES.filter(
                  (finish) => item.composition[finish] > 0,
                );
                return (
                  <li
                    key={cartLineKey(item)}
                    className="border-border grid grid-cols-[5.5rem_1fr] gap-4 border-b pb-6"
                  >
                    <div className="bg-surface flex aspect-square items-center justify-center overflow-hidden rounded-xl">
                      {finishes.map((finish) => {
                        const visual = productMedia.find(
                          (media) =>
                            media.kind === "product" && media.color === finish,
                        )!;
                        return (
                          <div
                            key={finish}
                            className="relative h-full min-w-0 flex-1"
                          >
                            <Image
                              src={visual.src}
                              alt={visual.alt[locale]}
                              fill
                              sizes="88px"
                              className="object-contain"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold">LUMIZA</p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {pack?.label ?? item.packId.toUpperCase()}
                      </p>
                      <p className="text-muted-foreground mt-2 text-xs font-semibold">
                        {labels.composition}
                      </p>
                      <ul className="text-sm">
                        {finishes.map((finish) => (
                          <li key={finish}>
                            {item.composition[finish]} × {labels.colors[finish]}
                          </li>
                        ))}
                      </ul>
                      {item.quantity > 1 ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                          {item.quantity} {labels.packsLabel}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground text-xs">
                        {pack
                          ? `${pack.quantity} ${pack.quantity === 1 ? labels.lamp : labels.lamps} ${labels.perPack}`
                          : labels.unavailable}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="border-border flex items-center rounded-full border">
                          <button
                            type="button"
                            disabled={item.quantity <= 1}
                            onClick={() =>
                              changeQuantity(item, item.quantity - 1)
                            }
                            aria-label={`${labels.decrease} ${pack?.label ?? item.packId}`}
                            className="focus-visible:outline-primary grid size-10 place-items-center rounded-full focus-visible:outline-2 disabled:opacity-40"
                          >
                            −
                          </button>
                          <span className="min-w-7 text-center text-sm font-bold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              changeQuantity(item, item.quantity + 1)
                            }
                            aria-label={`${labels.increase} ${pack?.label ?? item.packId}`}
                            className="focus-visible:outline-primary grid size-10 place-items-center rounded-full focus-visible:outline-2"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-bold">
                          {pack
                            ? formatCurrency(
                                pack.priceInCents * item.quantity,
                                "EUR",
                                locale,
                              )
                            : "—"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          saveCart(
                            items.filter((entry) => entry !== item),
                            packs,
                          )
                        }
                        className="text-muted-foreground focus-visible:outline-primary mt-3 min-h-8 text-sm underline focus-visible:outline-2"
                      >
                        {labels.remove}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {limitReached ? (
            <p role="alert" className="text-primary mt-4 text-sm font-bold">
              {labels.max}
            </p>
          ) : null}
        </div>
        <div className="border-border border-t px-5 py-5 sm:px-7">
          <div className="flex justify-between font-bold">
            <span>{labels.subtotal}</span>
            <span>{formatCurrency(subtotal, "EUR", locale)}</span>
          </div>
          <div className="text-muted-foreground mt-3 flex justify-between gap-4 text-sm">
            <span>{labels.shipping}</span>
            <span>{labels.nextStep}</span>
          </div>
          {items.length &&
          items.every((item) =>
            packs.some((pack) => pack.id === item.packId),
          ) ? (
            <Link
              href="/checkout"
              onClick={closeCart}
              className="bg-primary text-primary-foreground focus-visible:outline-foreground mt-6 flex min-h-12 items-center justify-center rounded-full px-5 font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {labels.checkout} →
            </Link>
          ) : null}
          <button
            type="button"
            onClick={closeCart}
            className="focus-visible:outline-primary mt-3 min-h-11 w-full text-sm font-semibold underline focus-visible:outline-2"
          >
            {labels.continue}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
