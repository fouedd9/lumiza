import { readFileSync } from "node:fs";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fr from "../messages/fr.json";
import en from "../messages/en.json";
import de from "../messages/de.json";
import { ReviewsSection } from "@/components/sections/reviews-section";

const messages = { fr, en, de };
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale }: { locale: keyof typeof messages }) =>
    createTranslator({
      locale,
      messages: messages[locale],
      namespace: "Reviews",
    }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("buyer reviews", () => {
  it("inserts only the new section between FAQ and final CTA", () => {
    const page = readFileSync("src/app/[locale]/page.tsx", "utf8");
    expect(page).toMatch(
      /<FaqSection locale=\{locale\} \/>\s*<ReviewsSection locale=\{locale\} \/>\s*<FinalCtaSection locale=\{locale\} \/>/,
    );
  });

  it.each(["fr", "en", "de"] as const)(
    "renders six attributed, dated and translated reviews in %s",
    async (locale) => {
      render(await ReviewsSection({ locale }));
      const copy = messages[locale].Reviews;
      expect(
        screen.getByRole("region", { name: copy.title }),
      ).toBeInTheDocument();

      const list = screen.getByRole("list", { name: copy.carousel });
      expect(list).toHaveAttribute("tabindex", "0");
      expect(list).toHaveAccessibleDescription(copy.instructions);
      const cards = within(list).getAllByRole("listitem");
      const names = [
        "Pat H.",
        "stephane favero",
        "Jerome",
        "Norbert 42",
        "BOYER",
        "chris-40",
      ];
      const dates = [
        "2026-08-31",
        "2026-06-18",
        "2026-08-26",
        "2026-08-27",
        "2026-03-13",
        "2025-11-16",
      ];
      expect(cards).toHaveLength(6);
      cards.forEach((card, index) => {
        const query = within(card);
        const review = Object.values(copy.items)[index];
        expect(query.getByText(names[index])).toBeInTheDocument();
        expect(
          query.getByRole("heading", { name: review.title }),
        ).toBeInTheDocument();
        expect(card.querySelector("blockquote")).toHaveTextContent(review.text);
        expect(card.querySelector("time")).toHaveAttribute(
          "datetime",
          dates[index],
        );
        expect(query.getByLabelText(copy.rating)).toBeInTheDocument();
        expect(query.getByText(copy.verified)).toBeInTheDocument();

        expect(card).toHaveTextContent(copy.country);
      });
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: copy.previous }),
      ).toHaveAttribute("aria-controls", list.id);
      expect(screen.getByRole("button", { name: copy.next })).toHaveAttribute(
        "aria-controls",
        list.id,
      );
    },
  );

  it("navigates by buttons and arrow keys and updates edge states after swiping", async () => {
    const user = userEvent.setup();
    render(await ReviewsSection({ locale: "fr" }));
    const list = screen.getByRole("list");
    const previous = screen.getByRole("button", { name: fr.Reviews.previous });
    const next = screen.getByRole("button", { name: fr.Reviews.next });
    Object.defineProperties(list, {
      clientWidth: { value: 300, configurable: true },
      scrollWidth: { value: 1800, configurable: true },
      scrollLeft: { value: 0, writable: true, configurable: true },
    });
    Array.from(list.children).forEach((card, index) =>
      Object.defineProperty(card, "offsetLeft", { value: 50 + index * 300 }),
    );
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo;
    fireEvent.scroll(list);
    expect(previous).toHaveAttribute("aria-disabled", "true");
    await user.click(previous);
    expect(scrollTo).not.toHaveBeenCalled();
    await user.click(next);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 300, behavior: "auto" });
    list.scrollLeft = 300;
    fireEvent.scroll(list);
    expect(previous).toHaveAttribute("aria-disabled", "false");
    await user.click(previous);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "auto" });
    list.focus();
    await user.keyboard("{ArrowRight}");
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: "auto" });
    await user.keyboard("{ArrowLeft}");
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "auto" });
    list.scrollLeft = 1500;
    fireEvent.scroll(list);
    expect(next).toHaveAttribute("aria-disabled", "true");
    scrollTo.mockClear();
    await user.click(next);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
