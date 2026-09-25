import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import type { AppLocale } from "@/i18n/routing";

const benefits = ["cordless", "rechargeable", "touch", "portable"] as const;
const icons = ["↗", "↯", "◉", "✦"] as const;

export async function ProductBenefits({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "Benefits" });

  return (
    <section id="advantages" className="bg-surface scroll-mt-24 py-20 sm:py-28">
      <Container>
        <div className="mb-12 max-w-3xl">
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            {t("eyebrow")}
          </p>
          <h2 className="font-display mt-4 text-[clamp(2.75rem,6vw,5rem)] leading-[0.98] font-extrabold tracking-[-0.055em] text-balance">
            {t("title")}
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit, index) => (
            <article
              key={benefit}
              className="border-border bg-surface-elevated rounded-[1.5rem] border p-6 sm:p-7"
            >
              <span
                aria-hidden="true"
                className="bg-primary text-primary-foreground grid size-11 place-items-center rounded-full text-lg font-bold"
              >
                {icons[index]}
              </span>
              <h3 className="font-display mt-8 text-xl font-extrabold">
                {t(`${benefit}.title`)}
              </h3>
              <p className="text-muted-foreground mt-3 leading-7">
                {t(`${benefit}.description`)}
              </p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
