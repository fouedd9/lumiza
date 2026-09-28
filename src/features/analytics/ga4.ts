import {
  optionalConsent,
  type ConsentDecision,
} from "@/features/consent/consent";

import type { CartItem } from "@/features/commerce/schemas/cart";
import type { ProductPack } from "@/features/product/types/product";

export const GA_READY_EVENT = "lumiza-ga4-ready";
export const GA_CURRENCY = "EUR" as const;

type ConsentValue = "granted" | "denied";

export type GoogleConsentState = {
  analytics_storage: ConsentValue;
  ad_storage: ConsentValue;
  ad_user_data: ConsentValue;
  ad_personalization: ConsentValue;
};

export type GaItem = {
  item_id: string;
  item_name: string;
  item_brand: "LUMIZA";
  item_category: "Lamp";
  item_variant: string;
  price: number;
  quantity: number;
};

export type EcommercePayload = {
  currency: typeof GA_CURRENCY;
  value: number;
  items: GaItem[];
};

type GoogleTagState = {
  measurementId: string;
  defaultConsentSet: boolean;
  configured: boolean;
};

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
    __lumizaGoogleTag?: GoogleTagState;
  }
}

export function validMeasurementId(value: string | undefined): value is string {
  return /^G-[A-Z0-9]+$/.test(value ?? "");
}

export function googleConsentState(
  decision: Pick<ConsentDecision, "analytics" | "marketing"> | null,
): GoogleConsentState {
  const analytics = decision?.analytics === true ? "granted" : "denied";
  const marketing = decision?.marketing === true ? "granted" : "denied";
  return {
    analytics_storage: analytics,
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
  };
}

function googleTag(measurementId: string) {
  window.dataLayer ??= [];
  window.gtag ??= function gtag() {
    // Google distinguishes executable gtag commands by their native Arguments shape.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.__lumizaGoogleTag ??= {
    measurementId,
    defaultConsentSet: false,
    configured: false,
  };
  return window.__lumizaGoogleTag;
}

export function setDefaultGoogleConsent(measurementId: string) {
  if (!validMeasurementId(measurementId) || typeof window === "undefined")
    return false;
  const state = googleTag(measurementId);
  if (!state.defaultConsentSet) {
    window.gtag!("consent", "default", googleConsentState(null));
    state.defaultConsentSet = true;
  }
  return true;
}

export function updateGoogleConsent(
  measurementId: string,
  decision: Pick<ConsentDecision, "analytics" | "marketing"> | null,
) {
  if (!setDefaultGoogleConsent(measurementId)) return false;
  window.gtag!("consent", "update", googleConsentState(decision));
  return true;
}

export function configureGoogleTag(measurementId: string) {
  if (!setDefaultGoogleConsent(measurementId)) return false;
  const state = googleTag(measurementId);
  if (!state.configured) {
    window.gtag!("js", new Date());
    // Enhanced Measurement owns initial and History API page views. Do not emit
    // manual page_view events or each App Router navigation would be duplicated.
    window.gtag!("config", measurementId);
    state.configured = true;
    window.dispatchEvent(new Event(GA_READY_EVENT));
  }
  return true;
}

export function trackGaEvent(
  eventName:
    "view_item" | "add_to_cart" | "view_cart" | "begin_checkout" | "purchase",
  parameters: Record<string, unknown>,
) {
  if (typeof window === "undefined" || !optionalConsent().analytics)
    return false;
  const state = window.__lumizaGoogleTag;
  if (!state?.configured || !validMeasurementId(state.measurementId))
    return false;
  try {
    window.gtag?.("event", eventName, parameters);
    return typeof window.gtag === "function";
  } catch {
    return false;
  }
}

export function catalogItem(
  pack: Pick<ProductPack, "id" | "label" | "priceInCents">,
  quantity: number,
  product: { sku: string; name: string },
): GaItem {
  return {
    item_id: `${product.sku}-${pack.id.toUpperCase()}`,
    item_name: product.name,
    item_brand: "LUMIZA",
    item_category: "Lamp",
    item_variant: pack.label,
    price: pack.priceInCents / 100,
    quantity,
  };
}

export function cartEcommercePayload(
  items: readonly CartItem[],
  packs: readonly ProductPack[],
  product: { sku: string; name: string },
): EcommercePayload {
  const gaItems = items.flatMap((item) => {
    const pack = packs.find((candidate) => candidate.id === item.packId);
    return pack ? [catalogItem(pack, item.quantity, product)] : [];
  });
  return {
    currency: GA_CURRENCY,
    value: gaItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    items: gaItems,
  };
}

export function resetGoogleTagForTests() {
  if (typeof window === "undefined") return;
  delete window.__lumizaGoogleTag;
  delete window.gtag;
  delete window.dataLayer;
}
