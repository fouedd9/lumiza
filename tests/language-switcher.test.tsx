import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LanguageSwitcher } from "@/components/layout/language-switcher";

const replace = vi.fn();

vi.mock("next-intl", () => ({ useLocale: () => "fr" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace }),
}));

describe("LanguageSwitcher", () => {
  it("preserves the current query string and anchor", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/fr?source=header#offers");

    render(
      <LanguageSwitcher
        label="Choose language"
        languageNames={{ fr: "Français", en: "English", de: "Deutsch" }}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Choose language"), "de");

    expect(replace).toHaveBeenCalledWith("/?source=header#offers", {
      locale: "de",
      scroll: false,
    });
  });
});
