"use client";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { cartEcommercePayload, trackGaEvent } from "@/features/analytics/ga4";
import {
  META_READY_EVENT,
  metaCartPayload,
  trackMetaEvent,
} from "@/features/analytics/meta-pixel";
import { lumizaProduct } from "@/features/product/data/product";
import type { PurchaseCatalog } from "@/features/product/data/purchase-catalog.server";
import type { ProductColor } from "@/features/product/types/product";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/utils/format-currency";

import { shippingCents, type ShippingCountry } from "../domain/pricing";
import { ENABLED_COUNTRIES, isShippingCountry } from "../domain/shipping";
import { cartDisplaySubtotal, physicalLampCount } from "../domain/cart-display";
import { saveCart, useCart } from "./cart-store";
import type { CartItem } from "../schemas/cart";
import { cartLineKey, cartSchema, FINISHES } from "../schemas/cart";

type SessionResult =
  | { ok: true; clientSecret: string; token: string }
  | { ok: false; code: string };

const pendingSessions = new Map<string, Promise<SessionResult>>();
const readySessions = new Map<
  string,
  { result: Extract<SessionResult, { ok: true }>; createdAt: number }
>();
const attempts = new Map<string, { attemptId: string; locale: AppLocale }>();

function attemptFor(selection: string, locale: AppLocale) {
  const key = `lumiza-checkout-attempt:${selection}`;
  let attempt = attempts.get(selection);
  if (!attempt) {
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          attemptId?: unknown;
          locale?: unknown;
        };
        if (
          typeof parsed.attemptId === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            parsed.attemptId,
          ) &&
          (parsed.locale === "fr" ||
            parsed.locale === "en" ||
            parsed.locale === "de")
        ) {
          attempt = { attemptId: parsed.attemptId, locale: parsed.locale };
        }
      }
    } catch {
      // Session storage may be disabled; the in-memory attempt still covers remounts.
    }
  }
  attempt ??= { attemptId: crypto.randomUUID(), locale };
  attempts.set(selection, attempt);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(attempt));
  } catch {
    // Keep the same attempt for this tab in memory.
  }
  return attempt;
}

function forgetSession(selection: string) {
  attempts.delete(selection);
  readySessions.delete(selection);
  try {
    window.sessionStorage.removeItem(`lumiza-checkout-attempt:${selection}`);
  } catch {
    // Storage may be disabled.
  }
}

function initializeSession(
  selection: string,
  items: CartItem[],
  country: ShippingCountry,
  locale: AppLocale,
) {
  const ready = readySessions.get(selection);
  if (ready && Date.now() - ready.createdAt < 29 * 60_000)
    return Promise.resolve(ready.result);
  readySessions.delete(selection);
  const pending = pendingSessions.get(selection);
  if (pending) return pending;
  const request = (async (): Promise<SessionResult> => {
    for (let retry = 0; retry < 2; retry++) {
      const attempt = attemptFor(selection, locale);
      const response = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: attempt.attemptId,
          items,
          country,
          locale: attempt.locale,
        }),
      });
      const data = (await response.json()) as {
        clientSecret?: string;
        token?: string;
        code?: string;
      };
      if (data.code === "expired" && retry === 0) {
        // The server has confirmed the old reservation was released.
        forgetSession(selection);
        continue;
      }
      if (!response.ok || !data.clientSecret || !data.token)
        return { ok: false, code: data.code ?? "retry" };
      const result = {
        ok: true as const,
        clientSecret: data.clientSecret,
        token: data.token,
      };
      readySessions.set(selection, { result, createdAt: Date.now() });
      return result;
    }
    return { ok: false, code: "retry" };
  })()
    .catch((): SessionResult => ({ ok: false, code: "retry" }))
    .finally(() => pendingSessions.delete(selection));
  pendingSessions.set(selection, request);
  return request;
}

async function cancelCheckoutToken(token: string) {
  try {
    const response = await fetch("/api/checkout/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await response.json()) as { code?: string };
    return response.ok && (data.code === "canceled" || data.code === "pending")
      ? data.code
      : "retry";
  } catch {
    return "retry";
  }
}

type Labels = {
  empty: string;
  back: string;
  country: string;
  countries: Record<ShippingCountry, string>;
  updatingDelivery: string;
  unsupportedCountry: string;
  quantity: string;
  remove: string;
  subtotal: string;
  shipping: string;
  total: string;
  tax: string;
  delivery: string;
  loading: string;
  loadingDetail: string;
  retryButton: string;
  powered: string;
  unavailable: string;
  invalid: string;
  inventory: string;
  retry: string;
  finishNote: string;
  colors: Record<ProductColor, string>;
  cancel: string;
  canceled: string;
  lamp: string;
  lamps: string;
  perPack: string;
  represented: string;
  composition: string;
};

export function CheckoutClient({
  locale,
  catalog,
  publishableKey,
  labels,
}: {
  locale: AppLocale;
  catalog: PurchaseCatalog | null;
  publishableKey: string | null;
  labels: Labels;
}) {
  const items = useCart();
  const [country, setCountry] = useState<ShippingCountry>("FR");
  const [pendingCountry, setPendingCountry] = useState<ShippingCountry | null>(
    null,
  );
  const transitionRef = useRef(false);
  const checkoutTracked = useRef(false);
  const metaCheckoutTracked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{
    selection: string;
    error: string | null;
    code?: string;
  } | null>(null);
  const [session, setSession] = useState<{
    selection: string;
    clientSecret: string;
    token: string;
    items: CartItem[];
    country: ShippingCountry;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [suppressedSelection, setSuppressedSelection] = useState<string | null>(
    null,
  );
  const router = useRouter();
  const stripe = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );
  const validSelection =
    !!catalog &&
    items.length > 0 &&
    physicalLampCount(items, catalog.packs) <= 30 &&
    cartSchema.safeParse(items).success &&
    items.every(
      (item) =>
        catalog.packs.some((pack) => pack.id === item.packId) &&
        FINISHES.every(
          (finish) =>
            item.composition[finish] === 0 || catalog.colors.includes(finish),
        ),
    );
  const selection = JSON.stringify({ country, items });
  const displayItems = session?.items ?? items;
  const displayCountry = pendingCountry ?? session?.country ?? country;
  const subtotal =
    catalog && (session || validSelection)
      ? cartDisplaySubtotal(displayItems, catalog.packs)
      : 0;
  const shipping = shippingCents(displayCountry);
  const total = subtotal + shipping;

  useEffect(() => {
    if (!validSelection || !catalog || checkoutTracked.current) return;
    checkoutTracked.current = true;
    trackGaEvent(
      "begin_checkout",
      cartEcommercePayload(items, catalog.packs, {
        sku: lumizaProduct.sku,
        name: lumizaProduct.name[locale],
      }),
    );
  }, [catalog, items, locale, validSelection]);

  useEffect(() => {
    const report = () => {
      if (
        !validSelection ||
        !catalog ||
        !publishableKey ||
        metaCheckoutTracked.current
      )
        return;
      if (
        trackMetaEvent(
          "InitiateCheckout",
          metaCartPayload(items, catalog.packs),
        )
      )
        metaCheckoutTracked.current = true;
    };
    report();
    window.addEventListener(META_READY_EVENT, report);
    return () => window.removeEventListener(META_READY_EVENT, report);
  }, [catalog, items, publishableKey, validSelection]);

  useEffect(() => {
    if (
      !validSelection ||
      !publishableKey ||
      session ||
      pendingCountry ||
      suppressedSelection === selection
    )
      return;
    let current = true;
    initializeSession(selection, items, country, locale).then((result) => {
      if (!current || transitionRef.current) return;
      if (result.ok) {
        setSession({
          selection,
          clientSecret: result.clientSecret,
          token: result.token,
          items,
          country,
        });
        setStatus(null);
      } else {
        setStatus({
          selection,
          code: result.code,
          error:
            result.code === "inventory"
              ? labels.inventory
              : result.code === "unsupported_country"
                ? labels.unsupportedCountry
                : result.code === "invalid"
                  ? labels.invalid
                  : result.code === "unavailable"
                    ? labels.unavailable
                    : labels.retry,
        });
      }
    });
    return () => {
      current = false;
    };
    // The selection captures cart and country; the first locale is persisted with its attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selection,
    validSelection,
    publishableKey,
    session,
    pendingCountry,
    suppressedSelection,
    retryCount,
    locale,
  ]);

  async function changeCountry(value: string) {
    if (transitionRef.current || value === country) return;
    if (!isShippingCountry(value)) {
      setStatus({
        selection,
        error: labels.unsupportedCountry,
        code: "unsupported_country",
      });
      return;
    }
    transitionRef.current = true;
    setPendingCountry(value);
    setBusy(true);
    setStatus(null);
    try {
      const existing = session
        ? { ok: true as const, token: session.token }
        : await (pendingSessions.get(selection) ??
            (readySessions.get(selection)
              ? Promise.resolve(readySessions.get(selection)!.result)
              : Promise.resolve(null)));
      if (existing && !existing.ok) {
        setStatus({ selection, error: labels.retry, code: "retry" });
        return;
      }
      if (existing?.ok) {
        const result = await cancelCheckoutToken(existing.token);
        if (result === "pending") {
          router.push(
            `/${locale}/order/confirmation?token=${encodeURIComponent(existing.token)}`,
          );
          return;
        }
        if (result !== "canceled") {
          setStatus({ selection, error: labels.retry, code: "retry" });
          return;
        }
        forgetSession(selection);
      }
      setSession(null);
      setCountry(value);
      setSuppressedSelection(null);
    } finally {
      setPendingCountry(null);
      setBusy(false);
      transitionRef.current = false;
    }
  }

  async function cancel() {
    if (!session || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await cancelCheckoutToken(session.token);
      if (result === "canceled") {
        forgetSession(session.selection);
        setSuppressedSelection(session.selection);
        setSession(null);
        setStatus({ selection: session.selection, error: labels.canceled });
      } else if (result === "pending")
        router.push(
          `/${locale}/order/confirmation?token=${encodeURIComponent(session.token)}`,
        );
      else setStatus({ selection: session.selection, error: labels.retry });
    } catch {
      setStatus({ selection: session.selection, error: labels.retry });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="bg-surface rounded-[1.75rem] p-6 sm:p-8">
        {displayItems.length === 0 ? (
          <>
            <p>{labels.empty}</p>
            <Link
              href="/#offers"
              className="text-primary mt-4 inline-block underline"
            >
              {labels.back}
            </Link>
          </>
        ) : (
          <>
            <ul className="space-y-4">
              {displayItems.map((item) => {
                const pack =
                  catalog?.packs.find(
                    (candidate) => candidate.id === item.packId,
                  ) ??
                  lumizaProduct.packs.find(
                    (candidate) => candidate.id === item.packId,
                  )!;
                return (
                  <li
                    key={cartLineKey(item)}
                    className="border-border border-b pb-4"
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-bold">LUMIZA · {pack.label}</span>
                      <span>
                        {formatCurrency(
                          pack.priceInCents * item.quantity,
                          "EUR",
                          locale,
                        )}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {pack.quantity}{" "}
                      {pack.quantity === 1 ? labels.lamp : labels.lamps}{" "}
                      {labels.perPack} · {item.quantity * pack.quantity}{" "}
                      {item.quantity * pack.quantity === 1
                        ? labels.lamp
                        : labels.lamps}{" "}
                      {labels.represented}
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs font-semibold">
                      {labels.composition}
                    </p>
                    <ul className="text-sm">
                      {FINISHES.filter(
                        (finish) => item.composition[finish] > 0,
                      ).map((finish) => (
                        <li key={finish}>
                          {item.composition[finish]} × {labels.colors[finish]}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center gap-4 text-sm">
                      <label>
                        {labels.quantity}{" "}
                        <input
                          type="number"
                          min="1"
                          max="10"
                          disabled={!!session}
                          value={item.quantity}
                          aria-label={`${pack.label} ${labels.quantity}`}
                          className="border-border bg-background ml-2 w-16 rounded-lg border p-2"
                          onChange={(event) => {
                            const quantity = Number(event.target.value);
                            if (
                              Number.isInteger(quantity) &&
                              quantity >= 1 &&
                              quantity <= 10
                            )
                              saveCart(
                                items.map((entry) =>
                                  entry === item
                                    ? { ...entry, quantity }
                                    : entry,
                                ),
                                catalog?.packs,
                              );
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={!!session}
                        className="min-h-11 underline disabled:opacity-50"
                        onClick={() =>
                          saveCart(
                            items.filter((entry) => entry !== item),
                            catalog?.packs,
                          )
                        }
                      >
                        {labels.remove}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <label htmlFor="shipping-country" className="mt-6 block font-bold">
              {labels.country}
            </label>
            <select
              id="shipping-country"
              value={displayCountry}
              disabled={!!pendingCountry}
              onChange={(event) => void changeCountry(event.target.value)}
              className="border-border bg-background mt-2 min-h-11 w-full rounded-xl border px-3"
            >
              {ENABLED_COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {labels.countries[code]}
                </option>
              ))}
            </select>
            <dl className="mt-7 space-y-3">
              <div className="flex justify-between">
                <dt>{labels.subtotal}</dt>
                <dd>{formatCurrency(subtotal, "EUR", locale)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{labels.shipping}</dt>
                <dd>{formatCurrency(shipping, "EUR", locale)}</dd>
              </div>
              <div className="border-border flex justify-between border-t pt-3 font-extrabold">
                <dt>{labels.total}</dt>
                <dd>{formatCurrency(total, "EUR", locale)}</dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-5 text-sm">
              {labels.finishNote}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">{labels.tax}</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {labels.delivery}
            </p>
          </>
        )}
      </div>
      <div className="min-w-0">
        {session && stripe && !pendingCountry ? (
          <div>
            <EmbeddedCheckoutProvider
              stripe={stripe}
              options={{
                clientSecret: session.clientSecret,
                onComplete: () => {
                  router.push(
                    `/${locale}/order/confirmation?token=${encodeURIComponent(session.token)}`,
                  );
                },
              }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
            <button
              type="button"
              disabled={busy}
              onClick={cancel}
              className="text-muted-foreground mt-5 min-h-11 underline disabled:opacity-50"
            >
              {labels.cancel}
            </button>
            {status?.error && (
              <p className="text-primary mt-3" role="alert">
                {status.error}
              </p>
            )}
          </div>
        ) : (
          <div className="border-border bg-surface-elevated min-h-[32rem] rounded-[1.75rem] border p-6 sm:p-8">
            <p className="text-muted-foreground">{labels.powered}</p>
            {items.length === 0 ? null : !publishableKey ? (
              <p className="mt-6" role="status">
                {labels.unavailable}
              </p>
            ) : status?.selection === selection && status.error ? (
              <div className="mt-8">
                <p className="text-primary" role="alert">
                  {status.error}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (status.code === "expired") forgetSession(selection);
                    setSuppressedSelection(null);
                    setStatus(null);
                    setRetryCount((count) => count + 1);
                  }}
                  className="bg-primary text-primary-foreground mt-6 min-h-12 rounded-full px-8 font-extrabold"
                >
                  {labels.retryButton}
                </button>
              </div>
            ) : validSelection ? (
              <div className="mt-8" role="status" aria-live="polite">
                <span
                  className="border-primary inline-block size-8 animate-spin rounded-full border-2 border-t-transparent"
                  aria-hidden="true"
                />
                <p className="font-display mt-6 text-2xl font-bold">
                  {pendingCountry ? labels.updatingDelivery : labels.loading}
                </p>
                <p className="text-muted-foreground mt-2">
                  {labels.loadingDetail}
                </p>
                <div className="mt-10 space-y-4" aria-hidden="true">
                  <div className="bg-border/55 h-12 animate-pulse rounded-xl" />
                  <div className="bg-border/55 h-12 animate-pulse rounded-xl" />
                  <div className="bg-border/55 h-28 animate-pulse rounded-xl" />
                </div>
              </div>
            ) : (
              <p className="mt-6" role="status">
                {labels.invalid}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
