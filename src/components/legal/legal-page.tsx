import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { business, commercePolicy } from "@/config/business";
import { getPublicSiteUrl } from "@/config/site";
import { routing } from "@/i18n/routing";
import { Container } from "@/components/ui/container";
import {
  ENABLED_COUNTRIES,
  shippingCents,
} from "@/features/commerce/domain/shipping";
import { formatCurrency } from "@/lib/utils/format-currency";

export type LegalKind =
  "legal" | "privacy" | "terms" | "shippingReturns" | "cookies";

type PageCopy = {
  title: string;
  introduction: string;
  sections: Record<string, { title: string; body: string }>;
};

const paths: Record<LegalKind, string> = {
  legal: "legal",
  privacy: "privacy",
  terms: "terms",
  shippingReturns: "shipping-returns",
  cookies: "cookies",
};

export async function legalMetadata(
  locale: string,
  kind: LegalKind,
): Promise<Metadata> {
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Legal" });
  const copy = t.raw(kind) as PageCopy;
  const siteUrl = getPublicSiteUrl();
  return {
    title: `${copy.title} | LUMIZA`,
    description: copy.introduction,
    alternates: siteUrl
      ? {
          canonical: `/${locale}/${paths[kind]}`,
          languages: Object.fromEntries(
            routing.locales.map((candidate) => [
              candidate,
              `/${candidate}/${paths[kind]}`,
            ]),
          ),
        }
      : undefined,
  };
}

export async function LegalPage({
  locale,
  kind,
}: {
  locale: string;
  kind: LegalKind;
}) {
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Legal" });
  const checkout = await getTranslations({ locale, namespace: "Checkout" });
  const copy = t.raw(kind) as PageCopy;
  const pending = t("pending");
  const shippingSummary = ENABLED_COUNTRIES.map(
    (country) =>
      `${checkout(`countries.${country}`)}: ${formatCurrency(shippingCents(country), "EUR", locale)}`,
  ).join(" · ");
  const facts =
    kind === "legal"
      ? [
          [t("fields.legalBusinessName"), business.legalBusinessName],
          [t("fields.registrationNumber"), business.registrationNumber],
          [t("fields.vatNumber"), business.vatNumber],
          [t("fields.registeredAddress"), business.registeredAddress],
          [t("fields.contactEmail"), business.contactEmail],
          [t("fields.publicationDirector"), business.publicationDirector],
          [t("fields.hostingProvider"), business.hostingProvider],
        ]
      : kind === "terms" || kind === "shippingReturns"
        ? [
            [t("fields.supportEmail"), business.supportEmail],
            [t("fields.returnsAddress"), business.returnsAddress],
            [
              t("fields.withdrawal"),
              t("sellerInfo.withdrawal", {
                days: commercePolicy.withdrawal.days,
              }),
            ],
            [
              t("fields.returns"),
              t(
                business.whatsappNumber
                  ? "sellerInfo.returnsEmailWhatsApp"
                  : "sellerInfo.returnsEmail",
                { email: business.supportEmail },
              ),
            ],
            [t("fields.refunds"), t("sellerInfo.refunds")],
            [
              t("fields.shipping"),
              `${shippingSummary} · ${t("sellerInfo.perOrder")}`,
            ],
            [
              t("fields.deliveryTimes"),
              t("sellerInfo.deliveryTime", {
                min: commercePolicy.deliveryTimes.minBusinessDays,
                max: commercePolicy.deliveryTimes.maxBusinessDays,
              }),
            ],
            [t("fields.swissImportAndCustoms"), t("sellerInfo.switzerland")],
          ]
        : kind === "privacy"
          ? [
              [t("fields.privacyRetention"), commercePolicy.privacyRetention],
              [t("fields.contactEmail"), business.contactEmail],
            ]
          : [];

  return (
    <article className="py-16 sm:py-24">
      <Container className="max-w-4xl">
        <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
          LUMIZA
        </p>
        <h1 className="font-display mt-4 text-4xl font-extrabold break-words sm:text-6xl">
          {copy.title}
        </h1>
        <p className="text-muted-foreground mt-6 max-w-3xl leading-7">
          {copy.introduction}
        </p>
        {kind === "legal" || kind === "terms" || kind === "shippingReturns" ? (
          <p className="border-primary/40 bg-surface-elevated mt-8 rounded-xl border p-4 text-sm">
            {t("draftNotice")}
          </p>
        ) : null}
        <div className="mt-12 space-y-10">
          {Object.entries(copy.sections).map(([key, section]) => (
            <section key={key} aria-labelledby={`legal-${key}`}>
              <h2
                id={`legal-${key}`}
                className="font-display text-2xl font-bold break-words"
              >
                {section.title}
              </h2>
              <p className="text-muted-foreground mt-3 leading-7">
                {kind === "terms" && key === "delivery"
                  ? t("terms.sections.delivery.body", {
                      min: commercePolicy.deliveryTimes.minBusinessDays,
                      max: commercePolicy.deliveryTimes.maxBusinessDays,
                    })
                  : kind === "shippingReturns" && key === "timing"
                    ? t("shippingReturns.sections.timing.body", {
                        min: commercePolicy.deliveryTimes.minBusinessDays,
                        max: commercePolicy.deliveryTimes.maxBusinessDays,
                      })
                    : section.body}
              </p>
            </section>
          ))}
          {facts.length ? (
            <section aria-labelledby="merchant-facts">
              <h2
                id="merchant-facts"
                className="font-display text-2xl font-bold break-words"
              >
                {kind === "terms" || kind === "shippingReturns"
                  ? t("sellerFactsTitle")
                  : t("factsTitle")}
              </h2>
              <dl className="border-border mt-4 divide-y rounded-xl border px-5">
                {facts.map(([label, value]) => (
                  <div key={label} className="grid gap-2 py-3 sm:grid-cols-2">
                    <dt className="font-semibold break-words">{label}</dt>
                    <dd className="text-muted-foreground break-words whitespace-pre-line">
                      {value ?? pending}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </Container>
    </article>
  );
}
