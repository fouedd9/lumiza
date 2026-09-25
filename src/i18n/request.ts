import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  let activeLocale = locale;

  if (!activeLocale) {
    const localeParam = await rootParams.locale();

    if (!hasLocale(routing.locales, localeParam)) {
      notFound();
    }

    activeLocale = localeParam;
  }

  if (!hasLocale(routing.locales, activeLocale)) {
    notFound();
  }

  return {
    locale: activeLocale,
    messages: (await import(`../../messages/${activeLocale}.json`)).default,
  };
});
