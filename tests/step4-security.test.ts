import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { business, missingProductionDecisions } from "@/config/business";
import { getCommerceEnv } from "@/config/commerce-env.server";
import {
  enforcedCsp,
  reportOnlyCsp,
  securityHeaders,
} from "@/config/security-headers";
import { ENABLED_COUNTRIES } from "@/features/commerce/domain/shipping";
import fr from "@/../messages/fr.json";
import en from "@/../messages/en.json";
import de from "@/../messages/de.json";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Step 4 security and legal boundaries", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps server secrets out of client modules", () => {
    const files: string[] = [];
    function walk(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(path)) files.push(path);
      }
    }
    walk(resolve(root, "src"));
    for (const path of files) {
      const code = readFileSync(path, "utf8");
      if (!/^\s*["']use client["'];/.test(code)) continue;
      const runtimeCode = code.replace(/^import type .*$/gm, "");
      expect(runtimeCode, path).not.toMatch(
        /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|CRON_SECRET|commerce-repository|\.server["']/,
      );
    }
  });

  it("rejects invalid commerce credentials and requires reconciliation in production", () => {
    const values = {
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example_private_key",
      STRIPE_SECRET_KEY: "sk_test_example_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_example_secret",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example_public",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    };
    for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
    vi.stubEnv("NODE_ENV", "development");
    expect(getCommerceEnv().success).toBe(true);
    vi.stubEnv("STRIPE_SECRET_KEY", "pk_test_wrong");
    expect(getCommerceEnv().success).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", values.STRIPE_SECRET_KEY);
    vi.stubEnv("NODE_ENV", "production");
    expect(getCommerceEnv().success).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://lumiza.example");
    vi.stubEnv("STRIPE_MODE", "test");
    vi.stubEnv("CRON_SECRET", "cron_" + "a".repeat(40));
    expect(getCommerceEnv().success).toBe(true);
    vi.stubEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    expect(getCommerceEnv().success).toBe(false);
  });

  it("enforces safe framing headers and keeps full Stripe CSP under review", () => {
    expect(enforcedCsp).toContain("frame-ancestors 'none'");
    expect(reportOnlyCsp).toContain("https://js.stripe.com");
    expect(reportOnlyCsp).toContain("https://api.stripe.com");
    expect(securityHeaders(true)).toContainEqual(
      expect.objectContaining({ key: "Strict-Transport-Security" }),
    );
    expect(
      securityHeaders(false).some(
        (header) => header.key === "Strict-Transport-Security",
      ),
    ).toBe(false);
  });

  it("provides five localized legal routes without inventing merchant values", () => {
    for (const path of [
      "legal",
      "privacy",
      "terms",
      "shipping-returns",
      "cookies",
    ]) {
      expect(
        existsSync(resolve(root, `src/app/[locale]/${path}/page.tsx`)),
      ).toBe(true);
    }
    for (const messages of [fr, en, de]) {
      expect(Object.keys(messages.Legal)).toEqual(
        expect.arrayContaining([
          "legal",
          "privacy",
          "terms",
          "shippingReturns",
          "cookies",
        ]),
      );
      expect(messages.Footer.legal).toBeTruthy();
      expect(messages.Footer.cookiePreferences).toBeTruthy();
    }
    expect(business.legalBusinessName).toBeNull();
    expect(missingProductionDecisions()).toContain(
      "commercePolicy.swissImportAndCustoms",
    );
    expect(ENABLED_COUNTRIES).toEqual(["FR", "BE", "DE", "CH"]);
    expect(source("src/components/layout/footer.tsx")).toContain(
      'href="/shipping-returns"',
    );
  });

  it("keeps private pages unindexed and the outbox service-role-only", () => {
    expect(source("src/app/[locale]/order/confirmation/page.tsx")).toContain(
      "index: false",
    );
    expect(source("src/app/[locale]/checkout/page.tsx")).toContain(
      "index: false",
    );
    expect(source("next.config.ts")).toContain("no-referrer");
    const sql = source(
      "supabase/migrations/202609240001_confirmation_email_outbox.sql",
    );
    expect(sql).toContain("order_id uuid not null unique");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain(
      "revoke all on public.confirmation_email_outbox from anon, authenticated",
    );
  });
});
