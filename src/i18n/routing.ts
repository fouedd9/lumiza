import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en", "de"],
  defaultLocale: "fr",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];

export function isSupportedLocale(value: string): value is AppLocale {
  return routing.locales.some((locale) => locale === value);
}
