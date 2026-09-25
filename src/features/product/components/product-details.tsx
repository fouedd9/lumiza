import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { lumizaProduct } from "@/features/product/data/product";
import { getProductMedia } from "@/features/product/data/product-media";
import type { ProductColor } from "@/features/product/types/product";
import type { AppLocale } from "@/i18n/routing";

import { ProductExperience } from "./product-experience";

export async function ProductDetails({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "Product" });
  const media = getProductMedia(locale).filter(
    (item) => item.kind === "product",
  );
  const colorLabels: Record<ProductColor, string> = {
    black: t("colors.black"),
    gold: t("colors.gold"),
    silver: t("colors.silver"),
  };

  return (
    <section id="product" className="bg-background scroll-mt-24 py-20 sm:py-28">
      <Container>
        <div className="mb-12 grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
              {t("eyebrow")}
            </p>
            <h2 className="font-display mt-4 text-[clamp(2.75rem,6vw,5rem)] leading-[0.98] font-extrabold tracking-[-0.055em] text-balance">
              {t("title")}
            </h2>
          </div>
          <p className="text-muted-foreground max-w-xl leading-7 lg:justify-self-end">
            {t("description")}
          </p>
        </div>

        <ProductExperience
          media={media}
          colors={lumizaProduct.colors}
          colorLabels={colorLabels}
          labels={{
            gallery: t("gallery.label"),
            previous: t("gallery.previous"),
            next: t("gallery.next"),
            expand: t("gallery.expand"),
            close: t("gallery.close"),
            colors: t("colors.legend"),
            provisional: t("colors.provisional"),
            selected: t("colors.selected"),
            missingImage: t("colors.missingImage"),
          }}
        />

        <dl className="border-border mt-16 grid gap-6 border-y py-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              {t("facts.power")}
            </dt>
            <dd className="mt-2 text-lg font-bold">
              {lumizaProduct.specifications.powerWatts} W
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              {t("facts.temperature")}
            </dt>
            <dd className="mt-2 text-lg font-bold">
              {lumizaProduct.specifications.colorTemperatureKelvin} K
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              {t("facts.control")}
            </dt>
            <dd className="mt-2 text-lg font-bold">{t("facts.touch")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              {t("facts.charge")}
            </dt>
            <dd className="mt-2 text-lg font-bold">USB</dd>
          </div>
        </dl>
      </Container>
    </section>
  );
}
