import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ENABLED_COUNTRIES } from "@/features/commerce/domain/shipping";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202609230001_european_shipping.sql",
  ),
  "utf8",
);

describe("European shipping migration", () => {
  it("keeps the database constraint and reservation function aligned with the canonical zone", () => {
    const constraint = migration.match(/shipping_country in \(([^)]+)\)/)?.[1];
    const functionGuard = migration.match(/p_country not in \(([^)]+)\)/)?.[1];
    for (const list of [constraint, functionGuard]) {
      expect(list).toBeDefined();
      const codes = [...list!.matchAll(/'([A-Z]{2})'/g)].map(
        (match) => match[1],
      );
      expect(codes.sort()).toEqual([...ENABLED_COUNTRIES].sort());
      expect(codes).not.toContain("GB");
      expect(codes).not.toContain("ES");
    }
    expect(migration).toContain(
      "case when p_country = 'FR' then 0 else 1000 end",
    );
    expect(migration).toContain(
      "reserved_quantity = reserved_quantity + v_lamps",
    );
  });
});
