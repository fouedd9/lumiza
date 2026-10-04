import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/config/commerce-env.server", () => ({
  requireCommerceEnv: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

import { requireCommerceEnv } from "@/config/commerce-env.server";
import { captureCustomerPhone } from "@/features/commerce/repositories/commerce-repository";
import { createClient } from "@supabase/supabase-js";

const migration = readFileSync(
  resolve("supabase/migrations/202610040001_customer_phone.sql"),
  "utf8",
);
const rpc = vi.fn();

describe("paid-order customer phone persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCommerceEnv).mockReturnValue({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-test",
    } as never);
    vi.mocked(createClient).mockReturnValue({ rpc } as never);
    rpc.mockResolvedValue({ error: null });
  });

  it("sends only the verified session ID and Stripe phone to a privileged RPC", async () => {
    await captureCustomerPhone("cs_test_123", "+33 6 12 34 56 78");
    expect(rpc).toHaveBeenCalledWith("commerce_capture_customer_phone", {
      p_session: "cs_test_123",
      p_phone: "+33 6 12 34 56 78",
    });
  });

  it("propagates a failed write so a webhook replay can retry it", async () => {
    rpc.mockResolvedValue({ error: { message: "Unavailable" } });
    await expect(
      captureCustomerPhone("cs_test_123", "+33 6 12 34 56 78"),
    ).rejects.toThrow("Unavailable");
  });

  it("adds a nullable column and only fills a missing phone on a paid matching order", () => {
    expect(migration).toContain("add column customer_phone text;");
    expect(migration).not.toMatch(/customer_phone\s+text\s+not null/i);
    expect(migration).toContain("stripe_checkout_session_id = p_session");
    expect(migration).toContain("v_order.status <> 'paid'");
    expect(migration).toContain("v_order.customer_phone is null");
    expect(migration).toContain(
      "if p_phone is null or p_phone = '' then return",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
