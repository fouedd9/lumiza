import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { SectionLink } from "@/components/ui/section-link";
import type { AppLocale } from "@/i18n/routing";

export async function FinalCtaSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "FinalCta" });

  return (
    <section className="bg-primary text-primary-foreground py-20 sm:py-28">
      <Container className="flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-end">
        <div className="max-w-4xl">
          <p className="text-xs font-bold tracking-[0.18em] uppercase">
            {t("eyebrow")}
          </p>
          <h2 className="font-display mt-4 text-[clamp(3rem,7vw,6.5rem)] leading-[0.9] font-extrabold tracking-[-0.065em] text-balance">
            {t("title")}
          </h2>
        </div>
        <SectionLink
          href="#offers"
          className="bg-offer-ink focus-visible:outline-offer-ink inline-flex min-h-14 shrink-0 items-center gap-4 rounded-full px-7 font-extrabold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {t("cta")} <span aria-hidden="true">↑</span>
        </SectionLink>
      </Container>
    </section>
  );
}
