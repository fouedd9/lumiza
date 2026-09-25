import { getLocale, getTranslations } from "next-intl/server";

import { CartButton } from "@/features/commerce/components/cart-drawer";
import { getPurchaseCatalog } from "@/features/product/data/purchase-catalog.server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

import { LanguageSwitcher } from "./language-switcher";
import { ThemeSwitcher } from "../theme/theme-switcher";
import { Container } from "../ui/container";

export async function Header() {
  const t = await getTranslations("Navigation");
  const cartT = await getTranslations("Cart");
  const locale = (await getLocale()) as AppLocale;
  const catalog = await getPurchaseCatalog();

  const languageNames: Record<AppLocale, string> = {
    fr: t("languages.fr"),
    en: t("languages.en"),
    de: t("languages.de"),
  };

  const themeLabels = {
    light: t("themes.light"),
    dark: t("themes.dark"),
    system: t("themes.system"),
  };

  return (
    <header className="border-border bg-background/90 sticky inset-x-0 top-0 z-30 border-b backdrop-blur-xl">
      <Container className="flex min-h-20 items-center justify-between gap-3 py-3">
        <Link
          href="/"
          className="focus-visible:outline-primary shrink-0 text-xl font-extrabold tracking-[-0.05em] focus-visible:outline-2 focus-visible:outline-offset-4 sm:text-2xl"
          aria-label={t("homeLabel")}
        >
          lumiza<span className="text-primary">.</span>
        </Link>
        <nav
          aria-label={t("primaryLabel")}
          className="hidden items-center gap-7 lg:flex"
        >
          <Link className="nav-link" href="/#advantages">
            {t("advantages")}
          </Link>
          <Link href="/#offers" className="nav-link">
            {t("offers")}
          </Link>
          <Link className="nav-link" href="/#questions">
            {t("questions")}
          </Link>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <CartButton
            locale={locale}
            packs={catalog?.packs ?? []}
            labels={{
              title: cartT("title"),
              open: cartT("open"),
              close: cartT("close"),
              empty: cartT("empty"),
              continue: cartT("continue"),
              checkout: cartT("checkout"),
              remove: cartT("remove"),
              subtotal: cartT("subtotal"),
              shipping: cartT("shipping"),
              nextStep: cartT("nextStep"),
              max: cartT("max"),
              increase: cartT("increase"),
              decrease: cartT("decrease"),
              lamp: cartT("lamp"),
              lamps: cartT("lamps"),
              perPack: cartT("perPack"),
              unavailable: cartT("unavailable"),
              composition: cartT("composition"),
              packsLabel: cartT("packsLabel"),
              colors: {
                black: cartT("colors.black"),
                gold: cartT("colors.gold"),
                silver: cartT("colors.silver"),
              },
            }}
          />
          <LanguageSwitcher
            label={t("languageLabel")}
            languageNames={languageNames}
          />
          <ThemeSwitcher label={t("themeLabel")} labels={themeLabels} />
          <Link
            href="/#offers"
            aria-label={t("cta")}
            className="bg-foreground text-background focus-visible:outline-primary hidden min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-3 sm:inline-flex"
          >
            <span className="hidden xl:inline">{t("cta")}</span>
            <span aria-hidden="true">↘</span>
          </Link>
        </div>
      </Container>
    </header>
  );
}
