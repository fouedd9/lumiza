import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENABLED_COUNTRIES,
  shippingCents,
} from "@/features/commerce/domain/shipping";
import { lumizaProduct } from "@/features/product/data/product";

const bootstrap = readFileSync(
  resolve("supabase/production/001_fresh_commerce.sql"),
  "utf8",
);
const ownerStock = readFileSync(
  resolve(
    "supabase/production/002_owner_inventory_initialization.template.sql",
  ),
  "utf8",
);
const repository = readFileSync(
  resolve("src/features/commerce/repositories/commerce-repository.ts"),
  "utf8",
);
const testMixedMigration = readFileSync(
  resolve("supabase/migrations/202609240002_mixed_finish_packs.sql"),
  "utf8",
);

describe("fresh production database bootstrap contract", () => {
  it("installs exactly the RPC names called by the current repository", () => {
    const signatures = {
      commerce_reserve_checkout: [
        "p_attempt",
        "p_country",
        "p_items",
        "p_expires_at",
        "p_locale",
      ],
      commerce_attach_session: [
        "p_order",
        "p_session",
        "p_client_secret",
        "p_expires_at",
      ],
      commerce_fail_session: ["p_order"],
      commerce_mark_session_unknown: ["p_order"],
      commerce_process_event: [
        "p_event_id",
        "p_event_type",
        "p_session",
        "p_payment_status",
        "p_session_status",
        "p_amount_total",
        "p_shipping_country",
        "p_payment_intent",
        "p_email",
        "p_name",
      ],
      commerce_enqueue_paid_email: ["p_session"],
      commerce_backfill_paid_emails: [],
      commerce_claim_confirmation_email: ["p_worker"],
      commerce_finish_confirmation_email: ["p_job", "p_worker", "p_success"],
    };
    const expected = Object.keys(signatures);
    const installed = [
      ...bootstrap.matchAll(
        /create (?:or replace )?function public\.(commerce_[a-z_]+)\(/g,
      ),
    ].map((match) => match[1]);
    expect(installed.sort()).toEqual([...expected].sort());
    for (const [rpc, args] of Object.entries(signatures)) {
      expect(repository).toContain(`rpc("${rpc}"`);
      const sqlArgs = bootstrap.match(
        new RegExp(
          `create (?:or replace )?function public\\.${rpc}\\(([\\s\\S]*?)\\)\\s*returns`,
        ),
      )?.[1];
      expect(sqlArgs).toBeDefined();
      expect(
        sqlArgs
          ?.split(",")
          .map((arg) => arg.trim().split(/\s+/)[0])
          .filter(Boolean),
      ).toEqual(args);
      if (args.length) {
        const callArgs = repository.match(
          new RegExp(`rpc\\("${rpc}",\\s*\\{([\\s\\S]*?)\\}\\)`),
        )?.[1];
        expect(callArgs).toBeDefined();
        for (const arg of args)
          expect(callArgs).toMatch(new RegExp(`\\b${arg}:`));
      }
    }
  });

  it("uses the final mixed-finish reservation, release and payment bodies", () => {
    for (const rpc of [
      "commerce_reserve_checkout",
      "commerce_fail_session",
      "commerce_process_event",
    ]) {
      const body = (sql: string) =>
        sql.match(
          new RegExp(
            `create or replace function public\\.${rpc}\\([\\s\\S]*?end \\$\\$;`,
          ),
        )?.[0];
      expect(body(bootstrap)).toBeDefined();
      expect(body(bootstrap)).toBe(body(testMixedMigration));
    }
    expect(bootstrap).toContain("reservation_allocations");
    expect(bootstrap).toContain("order_items_composition_valid");
    expect(bootstrap).toContain("v_size <> v_pack.quantity");
  });

  it("seeds only the catalog and keeps physical stock and history empty", () => {
    expect(bootstrap).toContain(`('${lumizaProduct.sku}')`);
    for (const pack of lumizaProduct.packs) {
      expect(bootstrap).toContain(
        `('${pack.id}', ${pack.quantity}, ${pack.priceInCents}, '${pack.currency}')`,
      );
    }
    for (const finish of lumizaProduct.colors)
      expect(bootstrap).toContain(`'${finish}'`);
    expect(bootstrap).toMatch(/select id, 0, 0 from public\.products/);
    expect(bootstrap).toMatch(
      /select pv\.id, 0, 0 from public\.product_variants/,
    );
    expect(bootstrap).toContain(
      "fresh production bootstrap contains transactional history",
    );
    expect(bootstrap).not.toMatch(/\btruncate\b|cs_test_|\b150\b|\b50\b/i);
  });

  it("matches the four-country application shipping contract", () => {
    for (const country of ENABLED_COUNTRIES)
      expect(bootstrap).toContain(`'${country}'`);
    expect(bootstrap).toContain("p_country not in ('FR','BE','DE','CH')");
    expect(bootstrap).toContain(
      "case when p_country = 'FR' then 0 else 1000 end",
    );
    expect(ENABLED_COUNTRIES.map(shippingCents)).toEqual([0, 1000, 1000, 1000]);
  });

  it("requires an owner decision and refuses stock resets after commerce starts", () => {
    expect(ownerStock).toContain("v_black integer := null;");
    expect(ownerStock).toContain("v_gold integer := null;");
    expect(ownerStock).toContain("v_silver integer := null;");
    expect(ownerStock).toContain(
      "inventory initialization is allowed only before the first transaction",
    );
    expect(ownerStock).toContain("available_quantity = 0");
    expect(ownerStock).not.toMatch(/\btruncate\b|\bdelete\b/i);
  });

  it("enforces a fresh transaction and service-only RLS/RPC access", () => {
    expect(bootstrap.trimStart().startsWith("-- PRODUCTION ONLY")).toBe(true);
    expect(bootstrap).toContain(
      "fresh commerce bootstrap requires an empty public data schema",
    );
    expect(bootstrap).toContain("enable row level security");
    expect(bootstrap).toContain("from public, anon, authenticated");
    expect(bootstrap).toContain("to service_role");
    expect(bootstrap.trimEnd().endsWith("commit;")).toBe(true);
  });
});
