import { getTranslations } from "next-intl/server";

import { getCanonicalSiteUrl } from "@/config/site";
import type { AppLocale } from "@/i18n/routing";

import { getProductMedia } from "../data/product-media";
import { lumizaProduct } from "../data/product";
import { getPurchaseCatalog } from "../data/purchase-catalog.server";

export async function ProductStructuredData({ locale }: { locale: AppLocale }) {
  const [catalog, t] = await Promise.all([
    getPurchaseCatalog(),
    getTranslations({ locale, namespace: "Purchase.packs" }),
  ]);
  const siteUrl = getCanonicalSiteUrl();
  const websiteUrl = siteUrl.origin;
  const canonicalUrl = new URL(`/${locale}`, siteUrl).toString();
  const images = getProductMedia(locale)
    .filter((media) => media.kind === "product")
    .map((media) => new URL(media.src, siteUrl).toString());
  const offers = catalog?.packs.map((pack) => ({
    "@type": "Offer",
    name: `${pack.label} — ${pack.quantity} ${t(pack.quantity === 1 ? "lamp" : "lamps")}`,
    url: `${canonicalUrl}#offers`,
    priceCurrency: pack.currency,
    price: (pack.priceInCents / 100).toFixed(2),
  }));
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${websiteUrl}/#website`,
        name: "LUMIZA",
        url: websiteUrl,
        inLanguage: ["fr", "en", "de"],
      },
      {
        "@type": "Product",
        "@id": `${canonicalUrl}#product`,
        mainEntityOfPage: canonicalUrl,
        name: lumizaProduct.name[locale],
        description: lumizaProduct.description[locale],
        sku: lumizaProduct.sku,
        brand: { "@type": "Brand", name: "LUMIZA" },
        image: images,
        ...(offers?.length ? { offers } : {}),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
