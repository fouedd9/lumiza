import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import type { AppLocale } from "@/i18n/routing";

import { getProductMedia } from "../data/product-media";
import { getPurchaseCatalog } from "../data/purchase-catalog.server";
import { PurchaseExperience } from "./purchase-experience";

export async function PurchaseSection({ locale }: { locale: AppLocale }) {
  const [t, galleryT, catalog] = await Promise.all([
    getTranslations({ locale, namespace: "Purchase" }),
    getTranslations({ locale, namespace: "Product.gallery" }),
    getPurchaseCatalog(),
  ]);
  return (
    <section id="offers" className="bg-background scroll-mt-24 py-14 sm:py-24">
      <Container>
        <span
          id="product"
          className="relative -top-24 block"
          aria-hidden="true"
        />
        <PurchaseExperience
          locale={locale}
          catalog={catalog}
          media={getProductMedia(locale).filter(
            (item) =>
              item.kind === "product" &&
              (!catalog || catalog.colors.includes(item.color!)),
          )}
          labels={{
            brand: t("brand"),
            name: t("name"),
            description: t("description"),
            color: t("color"),
            selected: t("selected"),
            quantity: t("quantity"),
            increase: t("increase"),
            decrease: t("decrease"),
            finishIncrease: t("finishIncrease"),
            finishDecrease: t("finishDecrease"),
            add: t("add"),
            max: t("max"),
            unavailable: t("unavailable"),
            compose: t("compose"),
            composeSuffix: t("composeSuffix"),
            selectedCount: t("selectedCount"),
            remainingSingle: t("remainingSingle"),
            remainingPlural: t("remainingPlural"),
            gallery: {
              gallery: galleryT("label"),
              previous: galleryT("previous"),
              next: galleryT("next"),
              expand: galleryT("expand"),
              close: galleryT("close"),
            },
            colors: {
              black: t("colors.black"),
              gold: t("colors.gold"),
              silver: t("colors.silver"),
            },
            packs: {
              legend: t("packs.legend"),
              lamp: t("packs.lamp"),
              lamps: t("packs.lamps"),
              save: t("packs.save"),
              professional: t("packs.professional"),
            },
          }}
        />
      </Container>
    </section>
  );
}
