"use client";

import { useEffect } from "react";

import {
  META_READY_EVENT,
  metaEventId,
  trackMetaEvent,
} from "@/features/analytics/meta-pixel";
import type { PaidPurchase } from "@/features/analytics/purchase-analytics";
import { CONSENT_CHANGED_EVENT } from "@/features/consent/consent";
import { lumizaProduct } from "@/features/product/data/product";
import type { AppLocale } from "@/i18n/routing";

const reportedPurchases = new Set<string>();

export function metaPurchasePayload(order: PaidPurchase, locale: AppLocale) {
  const contents = order.items.map((item) => ({
    id: `${lumizaProduct.sku}-${item.pack.toUpperCase()}`,
    quantity: item.quantity,
    item_price: item.unitPriceInCents / 100,
  }));
  return {
    order_id: order.reference,
    content_ids: contents.map((item) => item.id),
    content_name: lumizaProduct.name[locale],
    content_type: "product",
    content_category: "Lamp",
    contents,
    value: order.totalInCents / 100,
    currency: "EUR" as const,
    num_items: contents.reduce((sum, item) => sum + item.quantity, 0),
  };
}

function storageKey(reference: string) {
  return `lumiza-meta-purchase:${reference}`;
}

export function reportMetaPurchaseOnce(
  order: PaidPurchase | null,
  locale: AppLocale,
) {
  if (!order) return false;
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
  const eventID = metaEventId("purchase", order.reference);
  if (
    !trackMetaEvent("Purchase", metaPurchasePayload(order, locale), {
      eventID,
    })
  )
    return false;
  reportedPurchases.add(key);
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Tracking must remain non-blocking if storage is unavailable.
  }
  return true;
}

export function MetaPurchaseAnalytics({
  order,
  locale,
}: {
  order: PaidPurchase;
  locale: AppLocale;
}) {
  useEffect(() => {
    const report = () => reportMetaPurchaseOnce(order, locale);
    report();
    window.addEventListener(CONSENT_CHANGED_EVENT, report);
    window.addEventListener(META_READY_EVENT, report);
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, report);
      window.removeEventListener(META_READY_EVENT, report);
    };
  }, [locale, order]);
  return null;
}

export function resetMetaReportedPurchasesForTests() {
  reportedPurchases.clear();
}
