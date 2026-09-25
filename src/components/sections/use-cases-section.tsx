import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { getProductMedia } from "@/features/product/data/product-media";
import type { AppLocale } from "@/i18n/routing";

const cases = [
  "home",
  "restaurant",
  "hospitality",
  "terrace",
  "gift",
  "finishes",
] as const;

export async function UseCasesSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "UseCases" });
  const lifestyleMedia = getProductMedia(locale).filter(
    (item) => item.kind === "lifestyle",
  );

  return (
    <section className="bg-surface py-20 sm:py-28">
      <Container>
        <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
          {t("eyebrow")}
        </p>
        <h2 className="font-display mt-4 max-w-4xl text-[clamp(2.75rem,6vw,5rem)] leading-[0.98] font-extrabold tracking-[-0.055em] text-balance">
          {t("title")}
        </h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((useCase) => {
            const media = lifestyleMedia.find((item) => item.id === useCase)!;

            return (
              <article
                key={useCase}
                className="group border-border bg-surface-elevated overflow-hidden rounded-[1.75rem] border shadow-sm transition-shadow duration-300 hover:shadow-xl"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={media.src}
                    alt={media.alt}
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none"
                  />
                </div>
                <div className="p-6 sm:p-7">
                  <h3 className="font-display text-2xl font-extrabold">
                    {t(`${useCase}.title`)}
                  </h3>
                  <p className="text-muted-foreground mt-3 leading-7">
                    {t(`${useCase}.description`)}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
        <p className="text-muted-foreground mt-6 text-sm">{t("terraceNote")}</p>
      </Container>
    </section>
  );
}
