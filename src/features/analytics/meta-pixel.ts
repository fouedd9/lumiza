import { optionalConsent } from "@/features/consent/consent";
import type { CartItem } from "@/features/commerce/schemas/cart";
import type { ProductPack } from "@/features/product/types/product";

export const META_READY_EVENT = "lumiza-meta-ready";
export const META_CURRENCY = "EUR" as const;

export type MetaEventName =
  "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase";

export type MetaEventParameters = Record<string, unknown>;

type MetaPixelFunction = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: IArguments[];
  push: MetaPixelFunction;
  loaded: boolean;
  version: "2.0";
};

type MetaPixelState = {
  pixelId: string;
  initialized: boolean;
  consentGranted: boolean;
  lastPageView: string | null;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    __lumizaMetaPixel?: MetaPixelState;
  }
}

export function validMetaPixelId(value: string | undefined): value is string {
  return /^\d{10,20}$/.test(value ?? "");
}

function metaPixel(pixelId: string) {
  if (!window.fbq) {
    const fbq = function metaPixelCommand() {
      const active = window.fbq!;
      if (active.callMethod) {
        // Meta's loader installs callMethod and expects the native Arguments object.
        // eslint-disable-next-line prefer-rest-params
        Reflect.apply(active.callMethod, active, arguments);
      } else {
        // Keep the canonical queue representation used by fbevents.js.
        // eslint-disable-next-line prefer-rest-params
        active.queue.push(arguments);
      }
    } as MetaPixelFunction;
    fbq.queue = [];
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    window._fbq = fbq;
  }
  window.__lumizaMetaPixel ??= {
    pixelId,
    initialized: false,
    consentGranted: false,
    lastPageView: null,
  };
  return window.__lumizaMetaPixel;
}

export function initializeMetaPixel(pixelId: string) {
  if (
    typeof window === "undefined" ||
    !validMetaPixelId(pixelId) ||
    !optionalConsent().marketing
  )
    return false;
  const state = metaPixel(pixelId);
  if (!state.consentGranted) {
    window.fbq!("consent", "grant");
    state.consentGranted = true;
  }
  if (!state.initialized) {
    window.fbq!("init", pixelId);
    state.initialized = true;
  }
  return true;
}

export function revokeMetaConsent() {
  if (typeof window === "undefined") return false;
  const state = window.__lumizaMetaPixel;
  if (!state?.initialized || !state.consentGranted || !window.fbq) return false;
  window.fbq("consent", "revoke");
  state.consentGranted = false;
  return true;
}

export function trackMetaEvent(
  eventName: MetaEventName,
  parameters: MetaEventParameters = {},
  options?: { eventID: string },
) {
  if (typeof window === "undefined" || !optionalConsent().marketing)
    return false;
  const state = window.__lumizaMetaPixel;
  if (!state?.initialized || !state.consentGranted || !window.fbq) return false;
  try {
    if (options) window.fbq("track", eventName, parameters, options);
    else window.fbq("track", eventName, parameters);
    return true;
  } catch {
    return false;
  }
}

export function trackMetaPageView(pathname: string, force = false) {
  const state = window.__lumizaMetaPixel;
  if (!state || (!force && state.lastPageView === pathname)) return false;
  if (!trackMetaEvent("PageView")) return false;
  state.lastPageView = pathname;
  return true;
}

export function metaContentId(pack: Pick<ProductPack, "id">) {
  return `LUMIZA-LED-01-${pack.id.toUpperCase()}`;
}

export function metaProductPayload(
  pack: Pick<ProductPack, "id" | "label" | "priceInCents">,
  quantity: number,
  productName: string,
) {
  const id = metaContentId(pack);
  return {
    content_ids: [id],
    content_name: `${productName} · ${pack.label}`,
    content_type: "product",
    content_category: "Lamp",
    value: (pack.priceInCents * quantity) / 100,
    currency: META_CURRENCY,
    quantity,
    contents: [{ id, quantity, item_price: pack.priceInCents / 100 }],
  };
}

export function metaCartPayload(
  items: readonly CartItem[],
  packs: readonly ProductPack[],
) {
  const contents = items.flatMap((item) => {
    const pack = packs.find((candidate) => candidate.id === item.packId);
    return pack
      ? [
          {
            id: metaContentId(pack),
            quantity: item.quantity,
            item_price: pack.priceInCents / 100,
          },
        ]
      : [];
  });
  return {
    content_ids: contents.map((content) => content.id),
    contents,
    content_type: "product",
    value: contents.reduce(
      (sum, content) => sum + content.item_price * content.quantity,
      0,
    ),
    currency: META_CURRENCY,
    num_items: contents.reduce((sum, content) => sum + content.quantity, 0),
  };
}

export function metaEventId(kind: "purchase", identifier: string) {
  return `lumiza-${kind}-${identifier}`;
}

export function resetMetaPixelForTests() {
  if (typeof window === "undefined") return;
  delete window.fbq;
  delete window._fbq;
  delete window.__lumizaMetaPixel;
}
