import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/script", () => ({
  default: ({
    strategy,
    ...props
  }: React.ComponentProps<"script"> & { strategy?: string }) => {
    void strategy;
    return <script data-testid="ga-script" {...props} />;
  },
}));

import {
  cartEcommercePayload,
  configureGoogleTag,
  googleConsentState,
  resetGoogleTagForTests,
} from "@/features/analytics/ga4";
import { GoogleAnalytics } from "@/features/analytics/google-analytics";
import {
  purchasePayload,
  reportPurchaseOnce,
  resetReportedPurchasesForTests,
} from "@/features/analytics/purchase-analytics";
import { saveConsent } from "@/features/consent/consent";
import { lumizaProduct } from "@/features/product/data/product";

const measurementId = "G-VBVBMNQDCM";

function queuedCommands() {
  return window.dataLayer ?? [];
}

function commands() {
  return queuedCommands().map((command) => Array.from(command));
}

describe("privacy-safe GA4 integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetGoogleTagForTests();
    resetReportedPurchasesForTests();
  });

  it("is absent when the public Measurement ID is missing", () => {
    const { queryByTestId } = render(
      <GoogleAnalytics measurementId={undefined} />,
    );
    expect(queryByTestId("ga-script")).not.toBeInTheDocument();
    expect(window.dataLayer).toBeUndefined();
  });

  it("sets all Consent Mode signals denied and does not load GA by default", async () => {
    const { queryByTestId } = render(
      <GoogleAnalytics measurementId={measurementId} />,
    );
    await waitFor(() => expect(commands().length).toBeGreaterThanOrEqual(2));
    expect(commands()[0]).toEqual([
      "consent",
      "default",
      {
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
    expect(queryByTestId("ga-script")).not.toBeInTheDocument();
  });

  it("queues native Arguments objects instead of inert plain Arrays", async () => {
    saveConsent({ analytics: true, marketing: false });
    render(<GoogleAnalytics measurementId={measurementId} />);
    await waitFor(() => expect(queuedCommands()).toHaveLength(4));

    expect(commands().map((command) => command.slice(0, 2))).toEqual([
      ["consent", "default"],
      ["consent", "update"],
      ["js", expect.any(Date)],
      ["config", measurementId],
    ]);
    for (const command of queuedCommands()) {
      expect(Array.isArray(command)).toBe(false);
      expect(Object.prototype.toString.call(command)).toBe(
        "[object Arguments]",
      );
    }
  });

  it("loads after analytics grant, updates revocation, and keeps marketing independent", async () => {
    saveConsent({ analytics: true, marketing: false });
    const { getByTestId } = render(
      <GoogleAnalytics measurementId={measurementId} />,
    );
    await waitFor(() => expect(getByTestId("ga-script")).toBeInTheDocument());
    expect(commands()).toContainEqual([
      "consent",
      "update",
      {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);

    act(() => {
      saveConsent({ analytics: false, marketing: true });
    });
    await waitFor(() =>
      expect(commands()).toContainEqual([
        "consent",
        "update",
        {
          analytics_storage: "denied",
          ad_storage: "granted",
          ad_user_data: "granted",
          ad_personalization: "granted",
        },
      ]),
    );
    expect(googleConsentState({ analytics: false, marketing: true })).toEqual({
      analytics_storage: "denied",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
  });

  it("configures once and never emits a manual duplicate page_view", async () => {
    saveConsent({ analytics: true, marketing: false });
    const view = render(<GoogleAnalytics measurementId={measurementId} />);
    await waitFor(() =>
      expect(commands().filter((call) => call[0] === "config")).toHaveLength(1),
    );
    view.rerender(<GoogleAnalytics measurementId={measurementId} />);
    act(() => window.dispatchEvent(new Event("storage")));
    expect(configureGoogleTag(measurementId)).toBe(true);
    expect(commands().filter((call) => call[0] === "config")).toHaveLength(1);
    expect(
      commands().some((call) => call[0] === "event" && call[1] === "page_view"),
    ).toBe(false);
  });

  it("builds recommended ecommerce payloads from real catalog prices without PII", () => {
    const cart = cartEcommercePayload(
      [
        {
          packId: "duo",
          quantity: 2,
          composition: { black: 1, gold: 1, silver: 0 },
        },
      ],
      lumizaProduct.packs,
      { sku: lumizaProduct.sku, name: lumizaProduct.name.en },
    );
    expect(cart).toMatchObject({
      currency: "EUR",
      value: 119.98,
      items: [
        {
          item_id: "LUMIZA-LED-01-DUO",
          item_variant: "DUO",
          price: 59.99,
          quantity: 2,
        },
      ],
    });

    const purchase = purchasePayload(
      {
        reference: "LZ-PUBLIC123",
        subtotalInCents: 5999,
        totalInCents: 6999,
        shippingInCents: 1000,
        items: [{ pack: "duo", quantity: 1, unitPriceInCents: 5999 }],
      },
      "en",
    );
    expect(purchase).toMatchObject({
      transaction_id: "LZ-PUBLIC123",
      currency: "EUR",
      value: 59.99,
      shipping: 10,
    });
    expect(JSON.stringify({ cart, purchase })).not.toMatch(
      /email|address|phone|stripe|client_secret/i,
    );
  });

  it("deduplicates a confirmed purchase across refresh-safe local storage", () => {
    saveConsent({ analytics: true, marketing: false });
    const gtag = vi.fn();
    window.gtag = gtag;
    configureGoogleTag(measurementId);
    gtag.mockClear();
    const order = {
      reference: "LZ-PAID123",
      subtotalInCents: 3499,
      totalInCents: 4499,
      shippingInCents: 1000,
      items: [{ pack: "solo", quantity: 1, unitPriceInCents: 3499 }],
    };

    expect(reportPurchaseOnce(order, "en")).toBe(true);
    expect(reportPurchaseOnce(order, "en")).toBe(false);
    resetReportedPurchasesForTests();
    expect(reportPurchaseOnce(order, "en")).toBe(false);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith(
      "event",
      "purchase",
      expect.objectContaining({ transaction_id: "LZ-PAID123" }),
    );
  });
});
