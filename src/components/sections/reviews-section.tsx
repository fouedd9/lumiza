import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import type { AppLocale } from "@/i18n/routing";
import { ReviewsCarousel } from "./reviews-carousel";

// Buyer identities and dates supplied with LUMIZA orders.
const buyers = [
  { id: "pat", name: "Pat H.", initials: "PH", date: "2026-08-31" },
  {
    id: "stephane",
    name: "stephane favero",
    initials: "SF",
    date: "2026-06-18",
  },
  { id: "jerome", name: "Jerome", initials: "J", date: "2026-08-26" },
  { id: "norbert", name: "Norbert 42", initials: "N", date: "2026-08-27" },
  { id: "boyer", name: "BOYER", initials: "B", date: "2026-03-13" },
  { id: "chris", name: "chris-40", initials: "C", date: "2025-11-16" },
] as const;

export async function ReviewsSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "Reviews" });
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <section
      id="buyer-reviews"
      aria-labelledby="buyer-reviews-title"
      className="bg-surface min-w-0 py-20 sm:py-28"
    >
      <Container>
        <div className="max-w-3xl">
          <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
            {t("eyebrow")}
          </p>
          <h2
            id="buyer-reviews-title"
            className="font-display mt-4 text-[clamp(2.75rem,5vw,4.5rem)] leading-[0.98] font-extrabold tracking-[-0.055em]"
          >
            {t("title")}
          </h2>
          <p className="text-muted-foreground mt-5 text-lg leading-7">
            {t("description")}
          </p>
        </div>
        <ReviewsCarousel
          labels={{
            previous: t("previous"),
            next: t("next"),
            instructions: t("instructions"),
            carousel: t("carousel"),
          }}
        >
          {buyers.map((buyer) => (
            <li
              key={buyer.id}
              className="border-border bg-surface-elevated flex h-full min-w-0 flex-col rounded-3xl border p-6 sm:p-8"
            >
              <p
                aria-label={t("rating")}
                className="text-primary text-xl tracking-[0.15em]"
              >
                <span aria-hidden="true">★★★★★</span>
              </p>
              <blockquote className="mt-5 flex-1">
                <h3 className="font-display text-xl leading-7 font-bold tracking-tight">
                  {t(`items.${buyer.id}.title`)}
                </h3>
                <p className="text-muted-foreground mt-3 text-base leading-7">
                  “{t(`items.${buyer.id}.text`)}”
                </p>
              </blockquote>
              <div className="border-border mt-8 flex items-center gap-3 border-t pt-6">
                <span
                  aria-hidden="true"
                  className="bg-surface text-foreground grid size-12 shrink-0 place-items-center rounded-full text-sm font-bold"
                >
                  {buyer.initials}
                </span>
                <div className="min-w-0">
                  <p className="font-bold">{buyer.name}</p>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">
                    {t("country")} ·{" "}
                    <time dateTime={buyer.date}>
                      {dateFormat.format(new Date(`${buyer.date}T12:00:00Z`))}
                    </time>
                  </p>
                </div>
              </div>
              <div className="text-muted-foreground mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="border-border inline-flex items-center gap-2 rounded-full border px-3 py-1">
                  <span aria-hidden="true">✓</span>
                  {t("verified")}
                </span>
              </div>
            </li>
          ))}
        </ReviewsCarousel>
      </Container>
    </section>
  );
}
