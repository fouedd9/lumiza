import { describe, expect, it } from "vitest";

import { isSupportedLocale, routing } from "@/i18n/routing";

describe("locale routing", () => {
  it("supports French, English and German with French as default", () => {
    expect(routing.locales).toEqual(["fr", "en", "de"]);
    expect(routing.defaultLocale).toBe("fr");
  });

  it("rejects unsupported locales", () => {
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("es")).toBe(false);
  });
});
