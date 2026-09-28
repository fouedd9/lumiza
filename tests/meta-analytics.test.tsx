import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let currentPathname = "/fr";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

vi.mock("next/script", () => ({
  default: ({
    strategy,
    ...props
  }: React.ComponentProps<"script"> & { strategy?: string }) => {
    void strategy;
    return <script data-testid="meta-script" {...props} />;
  },
}));

import {
  initializeMetaPixel,
  metaCartPayload,
  metaProductPayload,
  resetMetaPixelForTests,
  trackMetaEvent,
} from "@/features/analytics/meta-pixel";
import { MetaPixelProvider } from "@/features/analytics/meta-pixel-provider";
import {
  metaPurchasePayload,
  reportMetaPurchaseOnce,
  resetMetaReportedPurchasesForTests,
} from "@/features/analytics/meta-purchase-analytics";
import { saveConsent } from "@/features/consent/consent";
import { lumizaProduct } from "@/features/product/data/product";

const pixelId = "2496136304209526";

function commands() {
  return (window.fbq?.queue ?? []).map((command) => Array.from(command));
}

describe("consent-gated Meta Pixel", () => {
  beforeEach(() => {
    currentPathname = "/fr";
    window.localStorage.clear();
    resetMetaPixelForTests();
    resetMetaReportedPurchasesForTests();
  });

  it("fails closed without an ID or Marketing consent", async () => {
    const missing = render(<MetaPixelProvider pixelId={undefined} />);
    expect(missing.queryByTestId("meta-script")).not.toBeInTheDocument();
    expect(window.fbq).toBeUndefined();
    expect(trackMetaEvent("ViewContent", { value: 34.99 })).toBe(false);
    missing.unmount();

    const denied = render(<MetaPixelProvider pixelId={pixelId} />);
    await act(async () => undefined);
    expect(denied.queryByTestId("meta-script")).not.toBeInTheDocument();
    expect(window.fbq).toBeUndefined();
  });

  it("does not activate Meta for Analytics consent alone", async () => {
    saveConsent({ analytics: true, marketing: false });
    const view = render(<MetaPixelProvider pixelId={pixelId} />);
    await act(async () => undefined);
    expect(view.queryByTestId("meta-script")).not.toBeInTheDocument();
    expect(window.fbq).toBeUndefined();
  });

  it("loads, initializes, and sends one PageView after Marketing consent", async () => {
    saveConsent({ analytics: false, marketing: true });
    const view = render(<MetaPixelProvider pixelId={pixelId} />);
    await waitFor(() =>
      expect(view.getByTestId("meta-script")).toBeInTheDocument(),
    );
    expect(commands()).toEqual([
      ["consent", "grant"],
      ["init", pixelId],
      ["track", "PageView", {}],
    ]);

    act(() => window.dispatchEvent(new Event("storage")));
    view.rerender(<MetaPixelProvider pixelId={pixelId} />);
    expect(commands().filter((command) => command[0] === "init")).toHaveLength(
      1,
    );
    expect(
      commands().filter(
        (command) => command[0] === "track" && command[1] === "PageView",
      ),
    ).toHaveLength(1);
  });

  it("tracks SPA and locale navigation once per pathname", async () => {
    saveConsent({ analytics: false, marketing: true });
    const view = render(<MetaPixelProvider pixelId={pixelId} />);
    await waitFor(() => expect(commands()).toHaveLength(3));

    currentPathname = "/en";
    view.rerender(<MetaPixelProvider pixelId={pixelId} />);
    await waitFor(() =>
      expect(
        commands().filter(
          (command) => command[0] === "track" && command[1] === "PageView",
        ),
      ).toHaveLength(2),
    );
    view.rerender(<MetaPixelProvider pixelId={pixelId} />);
    expect(
      commands().filter(
        (command) => command[0] === "track" && command[1] === "PageView",
      ),
    ).toHaveLength(2);
  });

  it("revokes and restores Marketing consent without reload or reinitialization", async () => {
    saveConsent({ analytics: true, marketing: true });
    render(<MetaPixelProvider pixelId={pixelId} />);
    await waitFor(() => expect(commands()).toHaveLength(3));

    act(() => saveConsent({ analytics: true, marketing: false }));
    expect(commands()).toContainEqual(["consent", "revoke"]);
    expect(trackMetaEvent("AddToCart", { value: 34.99 })).toBe(false);

    act(() => saveConsent({ analytics: true, marketing: true }));
    await waitFor(() =>
      expect(commands().filter((command) => command[0] === "consent")).toEqual([
        ["consent", "grant"],
        ["consent", "revoke"],
        ["consent", "grant"],
      ]),
    );
    expect(commands().filter((command) => command[0] === "init")).toHaveLength(
      1,
    );
  });

  it("builds authoritative pack and checkout payloads without PII", () => {
    const pack = lumizaProduct.packs[1];
    const product = metaProductPayload(pack, 2, lumizaProduct.name.en);
    const checkout = metaCartPayload(
      [
        {
          packId: "duo",
          quantity: 2,
          composition: { black: 1, gold: 1, silver: 0 },
        },
      ],
      lumizaProduct.packs,
    );
    expect(product).toMatchObject({
      content_ids: ["LUMIZA-LED-01-DUO"],
      value: 119.98,
      currency: "EUR",
      quantity: 2,
    });
    expect(checkout).toMatchObject({
      content_ids: ["LUMIZA-LED-01-DUO"],
      value: 119.98,
      currency: "EUR",
      num_items: 2,
    });
    expect(JSON.stringify({ product, checkout })).not.toMatch(
      /email|phone|address|stripe|client_secret|payment_intent/i,
    );
  });

  it("requires a verified order and deduplicates Purchase with a stable eventID", () => {
    saveConsent({ analytics: false, marketing: true });
    expect(initializeMetaPixel(pixelId)).toBe(true);
    const order = {
      reference: "LZ-PAID123",
      subtotalInCents: 5999,
      totalInCents: 6999,
      shippingInCents: 1000,
      items: [{ pack: "duo", quantity: 1, unitPriceInCents: 5999 }],
    };

    expect(reportMetaPurchaseOnce(null, "en")).toBe(false);
    expect(reportMetaPurchaseOnce(order, "en")).toBe(true);
    expect(reportMetaPurchaseOnce(order, "en")).toBe(false);
    resetMetaReportedPurchasesForTests();
    expect(reportMetaPurchaseOnce(order, "en")).toBe(false);

    const purchase = commands().find(
      (command) => command[0] === "track" && command[1] === "Purchase",
    );
    expect(purchase).toEqual([
      "track",
      "Purchase",
      expect.objectContaining({
        order_id: "LZ-PAID123",
        value: 69.99,
        currency: "EUR",
      }),
      { eventID: "lumiza-purchase-LZ-PAID123" },
    ]);
    expect(JSON.stringify(metaPurchasePayload(order, "en"))).not.toMatch(
      /email|phone|address|stripe|client_secret|payment_intent/i,
    );
  });
});
