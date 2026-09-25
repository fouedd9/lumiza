import { describe, expect, it } from "vitest";

import de from "@/../messages/de.json";
import en from "@/../messages/en.json";
import fr from "@/../messages/fr.json";
import {
  business,
  commercePolicy,
  missingProductionDecisions,
  whatsappHref,
} from "@/config/business";
import {
  ENABLED_COUNTRIES,
  shippingCents,
} from "@/features/commerce/domain/shipping";

describe("configured CGV seller information", () => {
  it("keeps the supplied contact, return address and 14-day policy centralized", () => {
    expect(business.supportEmail).toBe("fouedsaidane2@gmail.com");
    expect(business.returnsAddress).toBe(
      "53 boulevard Joliot-Curie\n38600 Fontaine\nFrance",
    );
    expect(commercePolicy.withdrawal.days).toBe(14);
    expect(commercePolicy.returns.withdrawalReturnShippingPayer).toBe(
      "customer",
    );
    expect(commercePolicy.refunds.method).toBe(
      "original_unless_expressly_agreed",
    );
    expect(business.whatsappNumber).toBe("+33767653082");
    expect(commercePolicy.deliveryTimes).toEqual({
      minBusinessDays: 3,
      maxBusinessDays: 5,
    });
    expect(missingProductionDecisions()).not.toContain(
      "business.whatsappNumber",
    );
    expect(missingProductionDecisions()).not.toContain(
      "commercePolicy.deliveryTimes",
    );
    expect(missingProductionDecisions()).toContain(
      "commercePolicy.swissImportAndCustoms",
    );
  });

  it("uses only the existing four-country shipping rule", () => {
    expect(ENABLED_COUNTRIES).toEqual(["FR", "BE", "DE", "CH"]);
    expect(ENABLED_COUNTRIES.map(shippingCents)).toEqual([0, 1000, 1000, 1000]);
  });

  it("normalizes the confirmed number and encodes localized messages", () => {
    expect(whatsappHref()).toBe("https://wa.me/33767653082");
    for (const messages of [fr, en, de]) {
      const href = whatsappHref(undefined, messages.Contact.message);
      const url = new URL(href!);
      expect(url.origin).toBe("https://wa.me");
      expect(url.pathname).toBe("/33767653082");
      expect(url.searchParams.get("text")).toBe(messages.Contact.message);
      expect([...url.searchParams.keys()]).toEqual(["text"]);
    }
    expect(whatsappHref(null)).toBeNull();
    expect(whatsappHref("123")).toBeNull();
    expect(whatsappHref("+33612345678")).toBe("https://wa.me/33612345678");
    expect(whatsappHref("33612345678")).toBe("https://wa.me/33612345678");
  });

  it("provides equivalent seller information in FR, EN and DE", () => {
    for (const messages of [fr, en, de]) {
      expect(messages.Legal.sellerFactsTitle).toBeTruthy();
      expect(messages.Legal.fields.shipping).toBeTruthy();
      expect(messages.Legal.sellerInfo.withdrawal).toContain("{days}");
      expect(messages.Legal.sellerInfo.returnsEmail).toContain("{email}");
      expect(messages.Legal.sellerInfo.refunds).toBeTruthy();
      expect(messages.Legal.sellerInfo.switzerland).toBeTruthy();
      expect(messages.Contact.whatsapp).toBeTruthy();
      expect(messages.Checkout.delivery).toContain("{min}");
      expect(messages.Faq.shipping.answer).toContain("{max}");
      expect(messages.Legal.sellerInfo.deliveryTime).toContain("{min}");
      expect(messages.Legal.terms.sections.delivery.body).toContain("{max}");
      expect(messages.Legal.shippingReturns.sections.timing.body).toContain(
        "{max}",
      );
    }
  });
});
