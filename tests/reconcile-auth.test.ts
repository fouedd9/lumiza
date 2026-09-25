import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/commerce-env.server", () => ({ getCommerceEnv: vi.fn() }));
vi.mock("@/features/commerce/repositories/commerce-repository", () => ({
  listReconciliationCandidates: vi.fn(),
}));
vi.mock("@/features/commerce/services/checkout", () => ({
  beginCheckout: vi.fn(),
}));
vi.mock("@/features/commerce/services/payment-events", () => ({
  processCurrentSession: vi.fn(),
}));
vi.mock("@/features/commerce/stripe/client", () => ({ stripeClient: vi.fn() }));
vi.mock("@/features/email/confirmation-email.server", () => ({
  dispatchPendingConfirmations: vi.fn(),
}));

import { GET } from "@/app/api/internal/reconcile/route";
import { getCommerceEnv } from "@/config/commerce-env.server";
import { listReconciliationCandidates } from "@/features/commerce/repositories/commerce-repository";

describe("internal reconciliation authorization", () => {
  beforeEach(() => vi.stubEnv("CRON_SECRET", "cron_" + "a".repeat(40)));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each([null, "Bearer wrong", "cron_" + "a".repeat(40)])(
    "rejects missing or incorrect bearer %s",
    async (authorization) => {
      const response = await GET(
        new Request("http://localhost/api/internal/reconcile", {
          headers: authorization ? { authorization } : {},
        }),
      );
      expect(response.status).toBe(401);
      expect(listReconciliationCandidates).not.toHaveBeenCalled();
    },
  );

  it("never accepts the secret from a query string", async () => {
    const response = await GET(
      new Request("http://localhost/api/internal/reconcile?secret=cron_fake"),
    );
    expect(response.status).toBe(401);
  });

  it("accepts the configured bearer and checks commerce readiness", async () => {
    vi.mocked(getCommerceEnv).mockReturnValue({ success: false } as never);
    const response = await GET(
      new Request("http://localhost/api/internal/reconcile", {
        headers: { authorization: "Bearer cron_" + "a".repeat(40) },
      }),
    );
    expect(response.status).toBe(503);
    expect(listReconciliationCandidates).not.toHaveBeenCalled();
  });
});
