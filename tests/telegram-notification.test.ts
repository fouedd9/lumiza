import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/features/commerce/repositories/commerce-repository", () => ({
  claimPaidTelegram: vi.fn(),
  finishPaidTelegram: vi.fn(),
  getPaidOrderForTelegram: vi.fn(),
  getOrderItemSnapshots: vi.fn(),
}));
vi.mock("@/features/commerce/stripe/client", () => ({ stripeClient: vi.fn() }));
vi.mock("@/config/commerce-env.server", () => ({
  requireCommerceEnv: vi.fn(),
}));

import {
  claimPaidTelegram,
  finishPaidTelegram,
  getOrderItemSnapshots,
  getPaidOrderForTelegram,
} from "@/features/commerce/repositories/commerce-repository";
import { requireCommerceEnv } from "@/config/commerce-env.server";
import { stripeClient } from "@/features/commerce/stripe/client";
import {
  dispatchPendingPaidTelegram,
  notifyNewPaidOrder,
  renderPaidOrderTelegram,
} from "@/features/telegram/paid-order-notification.server";

const order = {
  id: "order-internal",
  status: "paid",
  public_order_reference: "LZ-ABC123",
  currency: "EUR",
  customer_name: "Jean Dupont",
  customer_email: "jean@example.com",
  shipping_country: "FR",
  shipping_cents: 0,
  total_cents: 7999,
  stripe_checkout_session_id: "cs_test_paid",
};
const lines = [
  {
    quantity: 1,
    unit_quantity: 2,
    unit_price_cents: 7999,
    total_price_cents: 7999,
    packs: { code: "duo" },
    composition: { black: 0, gold: 1, silver: 1 },
    product_variants: null,
  },
];
const session = {
  id: "cs_test_paid",
  livemode: false,
  status: "complete",
  payment_status: "paid",
  currency: "eur",
  amount_total: 7999,
  metadata: { order_id: order.id, shipping_country: "FR" },
  customer_details: { phone: "+33 6 12 34 56 78" },
  collected_information: {
    shipping_details: {
      name: "Jean Dupont",
      address: {
        line1: "12 rue de la Paix",
        line2: null,
        postal_code: "38000",
        city: "Grenoble",
        state: null,
        country: "FR",
      },
    },
  },
} as unknown as Stripe.Checkout.Session;
const fetchMock = vi.fn();

describe("paid-order Telegram notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", `123456:${"A".repeat(30)}`);
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100123456789");
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(requireCommerceEnv).mockReturnValue({
      STRIPE_MODE: "test",
    } as never);
    vi.mocked(claimPaidTelegram).mockResolvedValue({
      id: "job-internal",
      order_id: order.id,
    });
    vi.mocked(getPaidOrderForTelegram).mockResolvedValue(order as never);
    vi.mocked(getOrderItemSnapshots).mockResolvedValue(lines as never);
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ ok: true }),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("formats the verified paid order with authoritative amount, composition and available fulfillment data", () => {
    const text = renderPaidOrderTelegram(
      order as never,
      lines as never,
      session,
    );
    expect(text).toContain("LZ-ABC123");
    expect(text).toMatch(/79,99\s?€/);
    expect(text).toContain("DUO — 1 pack — 2 lampes");
    expect(text).toContain("1 × Or, 1 × Argent");
    expect(text).toContain("Jean Dupont");
    expect(text).toContain("jean@example.com");
    expect(text).toContain("+33 6 12 34 56 78");
    expect(text).toContain("12 rue de la Paix");
    expect(text).toContain("38000 Grenoble");
    expect(text).toContain("France");
    expect(text).not.toContain("123456:");
    expect(text).not.toContain("cs_test_paid");
    expect(text).not.toMatch(/card|4242|sk_test/i);
  });

  it("keeps customer-controlled text on one plain-text line", () => {
    const text = renderPaidOrderTelegram(
      { ...order, customer_name: "Jean\nPaiement : Annulé" } as never,
      lines as never,
      session,
    );
    expect(text).toContain("Nom : Jean Paiement : Annulé");
    expect(text).not.toContain("Nom : Jean\nPaiement");
  });

  it("sends once after a paid-transition job is claimed", async () => {
    await notifyNewPaidOrder(session);
    expect(claimPaidTelegram).toHaveBeenCalledWith(
      expect.any(String),
      session.id,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      text: string;
      chat_id: string;
    };
    expect(request.chat_id).toBe("-100123456789");
    expect(request.text).toContain("79,99");
    expect(finishPaidTelegram).toHaveBeenCalledWith(
      "job-internal",
      expect.any(String),
      "sent",
    );
  });

  it("does not resend for a replay or a second paid Stripe event for the same order", async () => {
    vi.mocked(claimPaidTelegram)
      .mockResolvedValueOnce({ id: "job-internal", order_id: order.id })
      .mockResolvedValueOnce(null);
    await notifyNewPaidOrder(session);
    await notifyNewPaidOrder(session);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("can retry a pending job through reconciliation using the verified Stripe session", async () => {
    const retrieve = vi.fn().mockResolvedValue(session);
    vi.mocked(stripeClient).mockReturnValue({
      checkout: { sessions: { retrieve } },
    } as never);
    await dispatchPendingPaidTelegram(1);
    expect(retrieve).toHaveBeenCalledWith(session.id);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(finishPaidTelegram).toHaveBeenCalledWith(
      "job-internal",
      expect.any(String),
      "sent",
    );
  });

  it("does not attempt delivery when no paid-transition job exists", async () => {
    vi.mocked(claimPaidTelegram).mockResolvedValue(null);
    await notifyNewPaidOrder(session);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps payment processing successful on an explicit Telegram API rejection", async () => {
    fetchMock.mockResolvedValue({
      status: 429,
      ok: false,
      json: async () => ({ ok: false, error_code: 429 }),
    });
    await expect(notifyNewPaidOrder(session)).resolves.toBeUndefined();
    expect(finishPaidTelegram).toHaveBeenCalledWith(
      "job-internal",
      expect.any(String),
      "retry",
    );
  });

  it("marks a timeout uncertain rather than risking a duplicate send", async () => {
    fetchMock.mockRejectedValue(new DOMException("timeout", "AbortError"));
    await expect(notifyNewPaidOrder(session)).resolves.toBeUndefined();
    expect(finishPaidTelegram).toHaveBeenCalledWith(
      "job-internal",
      expect.any(String),
      "uncertain",
    );
  });

  it.each(["missing", "malformed"])(
    "leaves commerce successful and the outbox pending with %s configuration",
    async (configuration) => {
      vi.stubEnv(
        "TELEGRAM_BOT_TOKEN",
        configuration === "missing" ? "" : "invalid-token",
      );
      await expect(notifyNewPaidOrder(session)).resolves.toBeUndefined();
      expect(claimPaidTelegram).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
