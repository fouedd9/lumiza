import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { SectionLink } from "@/components/ui/section-link";
import { lumizaProduct } from "@/features/product/data/product";
import { getProductMedia } from "@/features/product/data/product-media";
import type { AppLocale } from "@/i18n/routing";

export async function HeroSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "Home" });
  const heroMedia = getProductMedia(locale).find(
    (item) => item.kind === "product" && item.color === "gold",
  )!;

  return (
    <section className="bg-background relative overflow-hidden py-14 sm:py-20 lg:py-24">
      <div aria-hidden="true" className="ambient-orb" />
      <Container className="relative grid items-center gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 xl:gap-24">
        <div className="max-w-[43rem]">
          <p className="border-border bg-surface-elevated mb-7 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold tracking-[0.13em] uppercase">
            <span className="bg-primary size-2 rounded-full" />
            {t("eyebrow")}
          </p>
          <h1 className="hero-title font-display font-extrabold text-balance">
            {t("titleLead")}{" "}
            <em className="text-primary font-accent font-semibold">
              {t("titleAccent")}
            </em>
          </h1>
          <p className="text-muted-foreground mt-7 max-w-xl text-lg leading-8 sm:text-xl">
            {lumizaProduct.description[locale]}
          </p>
          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <SectionLink
              href="#offers"
              className="bg-primary text-primary-foreground focus-visible:outline-foreground inline-flex min-h-14 items-center gap-4 rounded-full px-7 text-base font-extrabold transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {t("cta")} <span aria-hidden="true">↓</span>
            </SectionLink>
            <SectionLink
              href="#product"
              className="text-foreground focus-visible:outline-primary inline-flex min-h-12 items-center font-bold underline decoration-[var(--border)] underline-offset-8 hover:decoration-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {t("secondaryCta")}
            </SectionLink>
          </div>
          <p className="text-muted-foreground mt-6 text-sm">{t("heroNote")}</p>
        </div>

        <figure className="border-border bg-surface relative aspect-square overflow-hidden rounded-[1.75rem] border shadow-[0_28px_80px_rgba(28,28,26,0.14)]">
          <Image
            src={heroMedia.src}
            alt={heroMedia.alt}
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 52vw"
            className="object-cover"
          />
        </figure>
      </Container>
    </section>
  );
}
