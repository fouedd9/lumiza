import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseCommerceEnv } from "@/config/commerce-env.server";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example_private_key",
  STRIPE_WEBHOOK_SECRET: "whsec_example_only_not_real",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};
const testKeys = {
  STRIPE_SECRET_KEY: "sk_test_example_only_not_real",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example_only_not_real",
};
const liveKeys = {
  STRIPE_SECRET_KEY: "sk_live_example_only_not_real",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example_only_not_real",
};

describe("explicit Stripe commerce mode", () => {
  it("keeps existing local TEST configuration working", () => {
    const parsed = parseCommerceEnv({ ...base, ...testKeys });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.STRIPE_MODE).toBe("test");
  });

  it("accepts matching TEST and LIVE pairs with an explicit production mode", () => {
    for (const [mode, keys] of [
      ["test", testKeys],
      ["live", liveKeys],
    ] as const) {
      const parsed = parseCommerceEnv(
        {
          ...base,
          ...keys,
          STRIPE_MODE: mode,
          NEXT_PUBLIC_SITE_URL: "https://shop.example.com",
          CRON_SECRET: "cron_" + "a".repeat(40),
        },
        true,
      );
      expect(parsed.success).toBe(true);
    }
  });

  it.each([
    [
      "live",
      {
        ...liveKeys,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
          testKeys.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      },
    ],
    [
      "test",
      {
        ...testKeys,
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
          liveKeys.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      },
    ],
    ["live", { ...testKeys, STRIPE_SECRET_KEY: liveKeys.STRIPE_SECRET_KEY }],
    ["test", { ...liveKeys, STRIPE_SECRET_KEY: testKeys.STRIPE_SECRET_KEY }],
  ] as const)("rejects mixed key pair in %s mode", (mode, keys) => {
    expect(
      parseCommerceEnv({ ...base, ...keys, STRIPE_MODE: mode }).success,
    ).toBe(false);
  });

  it("requires an explicit mode and reconciliation secret in production", () => {
    expect(
      parseCommerceEnv(
        {
          ...base,
          ...testKeys,
          NEXT_PUBLIC_SITE_URL: "https://shop.example.com",
        },
        true,
      ).success,
    ).toBe(false);
  });

  it.each([
    "http://shop.example.com",
    "http://localhost:3000",
    "https://localhost:3000",
    "https://shop.example.com/path",
    "https://shop.example.com?next=/checkout",
    "https://user:password@shop.example.com",
  ])("rejects an unsafe production origin: %s", (siteUrl) => {
    expect(
      parseCommerceEnv(
        {
          ...base,
          ...liveKeys,
          STRIPE_MODE: "live",
          NEXT_PUBLIC_SITE_URL: siteUrl,
          CRON_SECRET: "cron_" + "a".repeat(40),
        },
        true,
      ).success,
    ).toBe(false);
  });
});
