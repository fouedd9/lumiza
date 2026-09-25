import { describe, expect, it } from "vitest";

import { formatCurrency } from "@/lib/utils/format-currency";

describe("formatCurrency", () => {
  it("formats integer cents for the active locale", () => {
    expect(formatCurrency(3499, "EUR", "fr")).toMatch(/34,99\s€/);
    expect(formatCurrency(3499, "EUR", "de")).toMatch(/34,99\s€/);
    expect(formatCurrency(3499, "EUR", "en")).toContain("34.99");
  });

  it("rejects non-integer cents", () => {
    expect(() => formatCurrency(34.99, "EUR", "fr")).toThrow(TypeError);
  });
});
