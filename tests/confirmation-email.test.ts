import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/commerce/repositories/commerce-repository", () => ({
  getPaidOrderForEmail: vi.fn(),
  getOrderItemSnapshots: vi.fn(),
  claimConfirmationEmail: vi.fn(),
  finishConfirmationEmail: vi.fn(),
  backfillPaidEmails: vi.fn(),
}));
vi.mock("@/features/email/provider.server", () => ({ emailProvider: vi.fn() }));

import {
  claimConfirmationEmail,
  finishConfirmationEmail,
  getOrderItemSnapshots,
  getPaidOrderForEmail,
  backfillPaidEmails,
} from "@/features/commerce/repositories/commerce-repository";
import {
  renderConfirmationEmail,
  dispatchPendingConfirmations,
} from "@/features/email/confirmation-email.server";
import { emailProvider } from "@/features/email/provider.server";

const send = vi.fn();
const job = { id: "job-1", order_id: "order-1", attempts: 1 };

describe("paid-order email outbox", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPaidOrderForEmail).mockResolvedValue({
      id: "order-1",
      status: "paid",
      public_order_reference: "LZ-123",
      checkout_locale: "de",
      customer_email: "customer@example.test",
      shipping_country: "DE",
      subtotal_cents: 3499,
      shipping_cents: 1000,
      total_cents: 4499,
    });
    vi.mocked(getOrderItemSnapshots).mockResolvedValue([
      {
        quantity: 1,
        unit_quantity: 1,
        unit_price_cents: 3499,
        total_price_cents: 3499,
        packs: { code: "solo" },
        product_variants: { color: "black" },
        composition: { black: 1, gold: 0, silver: 0 },
      },
    ]);
    vi.mocked(emailProvider).mockReturnValue({ enabled: true, send } as never);
    vi.mocked(claimConfirmationEmail)
      .mockResolvedValueOnce(job)
      .mockResolvedValue(null);
  });

  it("renders the order locale, lines and totals without internal tokens", async () => {
    const message = await renderConfirmationEmail("order-1");
    expect(message?.subject).toContain("Bestellbestätigung");
    expect(message?.text).toContain("SOLO · 1 Leuchte");
    expect(message?.text).toContain("1 × Schwarz");
    expect(message?.text).toContain("44,99");
    expect(message?.text).toContain("Deutschland");
    expect(message?.text).not.toContain("cs_test_");
    expect(message?.text).not.toContain("confirmation_token");
  });

  it("dispatches one claimed job with a stable provider idempotency key", async () => {
    expect(await dispatchPendingConfirmations()).toMatchObject({
      sent: 1,
      failed: 0,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(backfillPaidEmails).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].idempotencyKey).toBe(
      "lumiza-order-confirmation-order-1",
    );
    expect(finishConfirmationEmail).toHaveBeenCalledWith(
      "job-1",
      expect.any(String),
      true,
    );
  });

  it("includes a mixed pack's per-pack finishes without changing outbox idempotency", async () => {
    vi.mocked(getOrderItemSnapshots).mockResolvedValue([
      {
        quantity: 2,
        unit_quantity: 10,
        unit_price_cents: 24999,
        total_price_cents: 49998,
        packs: { code: "pro" },
        product_variants: null,
        composition: { black: 2, gold: 5, silver: 3 },
      },
    ]);
    const message = await renderConfirmationEmail("order-1");
    expect(message?.text).toContain("5 × Gold pro Paket");
    expect(message?.text).toContain("3 × Silber pro Paket");
    expect(message?.text).toContain("2 × Schwarz pro Paket");
    expect(message?.idempotencyKey).toBe("lumiza-order-confirmation-order-1");
  });

  it("leaves payment intact and returns the claim to pending on email failure", async () => {
    send.mockRejectedValue(new Error("email transport down"));
    expect(await dispatchPendingConfirmations()).toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(finishConfirmationEmail).toHaveBeenCalledWith(
      "job-1",
      expect.any(String),
      false,
    );
  });

  it("does not claim or claim delivery while the provider is disabled", async () => {
    vi.mocked(emailProvider).mockReturnValue({ enabled: false, send } as never);
    expect(await dispatchPendingConfirmations()).toEqual({
      sent: 0,
      failed: 0,
      disabled: true,
    });
    expect(claimConfirmationEmail).not.toHaveBeenCalled();
    expect(backfillPaidEmails).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
