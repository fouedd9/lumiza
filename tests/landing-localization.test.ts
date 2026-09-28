import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";

const localizedMessages = { fr, en, de } as const;

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("landing page translations", () => {
  it("uses German checkout copy on the German checkout route", () => {
    expect(de.Checkout.title).toBe("Prüfen Sie Ihre Bestellung.");
    expect(de.Checkout.title).not.toBe(fr.Checkout.title);
  });
  it("keeps the same complete translation key set in FR, EN and DE", () => {
    const frenchKeys = flattenKeys(fr).sort();

    expect(flattenKeys(en).sort()).toEqual(frenchKeys);
    expect(flattenKeys(de).sort()).toEqual(frenchKeys);
  });

  it.each([
    [
      "fr",
      "La lampe LED sans fil rechargeable qui rend chaque soir",
      "Nos offres",
      "La lampe fonctionne-t-elle sans fil ?",
    ],
    [
      "en",
      "The rechargeable cordless LED table lamp that makes every evening",
      "Our offers",
      "Is the lamp cordless?",
    ],
    [
      "de",
      "Die wiederaufladbare kabellose LED-Tischleuchte, die jeden Abend",
      "Unsere Angebote",
      "Funktioniert die Leuchte kabellos?",
    ],
  ] as const)(
    "provides meaningful %s hero, navigation, offer and FAQ copy",
    (locale, hero, navigation, faq) => {
      const t = createTranslator({
        locale,
        messages: localizedMessages[locale],
      });

      expect(t("Home.titleLead")).toBe(hero);
      expect(t("Navigation.offers")).toBe(navigation);
      expect(t("Home.offers.soloNote")).not.toHaveLength(0);
      expect(t("Faq.cordless.question")).toBe(faq);
    },
  );
});
