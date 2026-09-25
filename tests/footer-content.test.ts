import { describe, expect, it } from "vitest";

import { socialLinks } from "@/config/social";

import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";

describe("customer-facing footer and payment copy", () => {
  it.each([fr, en, de])(
    "does not advertise the test checkout in customer copy",
    (messages) => {
      const visibleCopy = JSON.stringify(messages);

      expect(visibleCopy).not.toMatch(
        /Paiement en test|Test checkout|Testzahlung|Stripe TEST|Stripe-TEST|test mode during validation|im Testmodus/,
      );
      expect(messages.Footer.securePayment).toBeTruthy();
      expect(messages.Footer.cardPayment).toBeTruthy();
      expect(messages.Footer).not.toHaveProperty("legalPending");
      expect(messages.Footer).not.toHaveProperty("note");
    },
  );

  it("does not invent social profile links", () => {
    expect(socialLinks).toEqual({ facebook: null, instagram: null });
  });
});
