"use client";

import { useEffect } from "react";

import {
  GA_READY_EVENT,
  type GaItem,
  trackGaEvent,
} from "@/features/analytics/ga4";
import { CONSENT_CHANGED_EVENT } from "@/features/consent/consent";
import { lumizaProduct } from "@/features/product/data/product";
import type { AppLocale } from "@/i18n/routing";

const reportedPurchases = new Set<string>();

export type PaidPurchase = {
  reference: string;
  subtotalInCents: number;
  totalInCents: number;
  shippingInCents: number;
  items: {
    pack: string;
    quantity: number;
    unitPriceInCents: number;
  }[];
};

export function purchasePayload(order: PaidPurchase, locale: AppLocale) {
  const items: GaItem[] = order.items.map((item) => ({
    item_id: `${lumizaProduct.sku}-${item.pack.toUpperCase()}`,
    item_name: lumizaProduct.name[locale],
    item_brand: "LUMIZA",
    item_category: "Lamp",
    item_variant: item.pack.toUpperCase(),
    price: item.unitPriceInCents / 100,
    quantity: item.quantity,
  }));
  return {
    transaction_id: order.reference,
    currency: "EUR" as const,
    value: order.subtotalInCents / 100,
    shipping: order.shippingInCents / 100,
    items,
  };
}

function storageKey(reference: string) {
  return `lumiza-ga4-purchase:${reference}`;
}

export function reportPurchaseOnce(order: PaidPurchase, locale: AppLocale) {
  const key = storageKey(order.reference);
  if (reportedPurchases.has(key)) return false;
  try {
    if (window.localStorage.getItem(key) === "1") {
      reportedPurchases.add(key);
      return false;
    }
  } catch {
    // The in-memory set still prevents duplicate events in this page lifecycle.
  }
  if (!trackGaEvent("purchase", purchasePayload(order, locale))) return false;
  reportedPurchases.add(key);
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Tracking must remain non-blocking if storage is unavailable.
  }
  return true;
}

export function PurchaseAnalytics({
  order,
  locale,
}: {
  order: PaidPurchase;
  locale: AppLocale;
}) {
  useEffect(() => {
    const report = () => reportPurchaseOnce(order, locale);
    report();
    window.addEventListener(CONSENT_CHANGED_EVENT, report);
    window.addEventListener(GA_READY_EVENT, report);
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, report);
      window.removeEventListener(GA_READY_EVENT, report);
    };
  }, [locale, order]);
  return null;
}

export function resetReportedPurchasesForTests() {
  reportedPurchases.clear();
}
