import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/commerce-env.server", () => ({ getCommerceEnv: vi.fn() }));
vi.mock("@/features/commerce/stripe/client", () => ({ stripeClient: vi.fn() }));
vi.mock("@/features/commerce/services/payment-events", () => ({
  processVerifiedStripeEvent: vi.fn(),
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { getCommerceEnv } from "@/config/commerce-env.server";
import { processVerifiedStripeEvent } from "@/features/commerce/services/payment-events";
import { stripeClient } from "@/features/commerce/stripe/client";

const event = {
  id: "evt_test_123",
  type: "checkout.session.completed",
  livemode: false,
};
const verify = vi.fn();

function request(signature: string | null = "test-signature") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: "raw-body",
    headers: signature ? { "stripe-signature": signature } : {},
  });
}

describe("Stripe webhook boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCommerceEnv).mockReturnValue({
      success: true,
      data: { STRIPE_WEBHOOK_SECRET: "whsec_test" },
    } as never);
    vi.mocked(stripeClient).mockReturnValue({
      webhooks: { constructEvent: verify },
    } as never);
    verify.mockReturnValue(event);
    vi.mocked(processVerifiedStripeEvent).mockResolvedValue("processed");
  });

  it("rejects an absent or invalid signature before changing state", async () => {
    expect((await POST(request(null))).status).toBe(400);
    verify.mockImplementation(() => {
      throw new Error("bad signature");
    });
    expect((await POST(request())).status).toBe(400);
    expect(processVerifiedStripeEvent).not.toHaveBeenCalled();
  });

  it("verifies the untouched raw body and retries a failed database transition", async () => {
    vi.mocked(processVerifiedStripeEvent).mockRejectedValue(
      new Error("database unavailable"),
    );
    const response = await POST(request());
    expect(verify).toHaveBeenCalledWith(
      "raw-body",
      "test-signature",
      "whsec_test",
    );
    expect(response.status).toBe(503);
  });

  it("acknowledges only a processed event", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(processVerifiedStripeEvent).toHaveBeenCalledWith(event);
  });
});
