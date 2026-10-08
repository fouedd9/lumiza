import { render, screen } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { createElement, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { socialLinks } from "@/config/social";
import { Footer } from "@/components/layout/footer";

import de from "../messages/de.json";
import en from "../messages/en.json";
import fr from "../messages/fr.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    createTranslator({ locale: "fr", messages: fr, namespace: "Footer" }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: (props: ComponentProps<"a">) => createElement("a", props),
}));

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

  it("renders the configured LUMIZA social profiles with accessible and safe external links", async () => {
    const expectedProfiles = {
      facebook: "https://www.facebook.com/people/Lumiza/61594535386733/",
      instagram:
        "https://www.instagram.com/lumiza.fr?stkn=ZzJ3cGh0bnZseTc0&utm_source=qr",
    };
    expect(socialLinks).toEqual(expectedProfiles);

    render(await Footer());

    for (const name of ["facebook", "instagram"] as const) {
      const link = screen.getByRole("link", { name: fr.Footer[name] });
      expect(link).toHaveAttribute("href", expectedProfiles[name]);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
