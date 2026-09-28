import type { MetadataRoute } from "next";

import { getCanonicalSiteUrl } from "@/config/site";
import { routing } from "@/i18n/routing";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getCanonicalSiteUrl();
  const languages = {
    ...Object.fromEntries(
      routing.locales.map((locale) => [
        locale,
        new URL(`/${locale}`, siteUrl).toString(),
      ]),
    ),
    "x-default": new URL("/fr", siteUrl).toString(),
  };

  return routing.locales.map((locale) => ({
    url: new URL(`/${locale}`, siteUrl).toString(),
    alternates: { languages },
  }));
}
