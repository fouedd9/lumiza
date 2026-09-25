import type { AppLocale } from "@/i18n/routing";

const numberFormatLocales: Record<AppLocale, string> = {
  fr: "fr-FR",
  en: "en-IE",
  de: "de-DE",
};

export function formatCurrency(
  amountInCents: number,
  currency: string,
  locale: AppLocale,
): string {
  if (!Number.isInteger(amountInCents)) {
    throw new TypeError("The amount must be expressed as integer cents.");
  }

  return new Intl.NumberFormat(numberFormatLocales[locale], {
    style: "currency",
    currency,
  }).format(amountInCents / 100);
}
