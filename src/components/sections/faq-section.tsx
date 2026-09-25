import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { commercePolicy } from "@/config/business";
import type { AppLocale } from "@/i18n/routing";

const questions = [
  "cordless",
  "recharge",
  "colors",
  "multiple",
  "shipping",
  "payment",
] as const;

export type FaqItem = { question: string; answer: string };

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="border-border border-t">
      {items.map((item) => (
        <details
          key={item.question}
          className="faq-item border-border border-b"
        >
          <summary className="focus-visible:outline-primary flex cursor-pointer list-none items-center justify-between gap-5 py-6 text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-4">
            {item.question}
            <span aria-hidden="true" className="faq-icon text-primary text-2xl">
              +
            </span>
          </summary>
          <p className="text-muted-foreground max-w-2xl pb-6 leading-7">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}

export async function FaqSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "Faq" });
  const items = questions.map((question) => ({
    question: t(`${question}.question`),
    answer:
      question === "shipping"
        ? t("shipping.answer", {
            min: commercePolicy.deliveryTimes.minBusinessDays,
            max: commercePolicy.deliveryTimes.maxBusinessDays,
          })
        : t(`${question}.answer`),
  }));

  return (
    <section
      id="questions"
      className="bg-background scroll-mt-24 py-20 sm:py-28"
    >
      <Container className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
        <div>
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            {t("eyebrow")}
          </p>
          <h2 className="font-display mt-4 text-[clamp(2.75rem,5vw,4.5rem)] leading-[0.98] font-extrabold tracking-[-0.055em]">
            {t("title")}
          </h2>
          <p className="text-muted-foreground mt-5 max-w-md leading-7">
            {t("description")}
          </p>
        </div>
        <FaqList items={items} />
      </Container>
    </section>
  );
}
