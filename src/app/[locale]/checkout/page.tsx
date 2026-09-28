import { hasLocale } from "next-intl";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { commercePolicy } from "@/config/business";
import { getCommerceEnv } from "@/config/commerce-env.server";
import { CheckoutClient } from "@/features/commerce/components/checkout-client";
import {
  ENABLED_COUNTRIES,
  type ShippingCountry,
} from "@/features/commerce/domain/shipping";
import { getPurchaseCatalog } from "@/features/product/data/purchase-catalog.server";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: null,
  openGraph: null,
  twitter: null,
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Checkout" });
  const parsed = getCommerceEnv();
  const catalog = await getPurchaseCatalog();
  return (
    <section className="py-12 sm:py-20">
      <Container>
        <p className="text-primary text-xs font-bold tracking-[0.18em] uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="font-display mt-4 text-4xl font-extrabold tracking-[-0.055em] sm:text-6xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-4 mb-10 max-w-2xl">
          {t("description")}
        </p>
        <CheckoutClient
          locale={locale}
          catalog={catalog}
          publishableKey={
            parsed.success && catalog
              ? parsed.data.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
              : null
          }
          labels={{
            empty: t("empty"),
            back: t("back"),
            country: t("country"),
            countries: Object.fromEntries(
              ENABLED_COUNTRIES.map((code) => [code, t(`countries.${code}`)]),
            ) as Record<ShippingCountry, string>,
            updatingDelivery: t("updatingDelivery"),
            unsupportedCountry: t("unsupportedCountry"),
            quantity: t("quantity"),
            remove: t("remove"),
            subtotal: t("subtotal"),
            shipping: t("shipping"),
            total: t("total"),
            tax: t("tax"),
            delivery: t("delivery", {
              min: commercePolicy.deliveryTimes.minBusinessDays,
              max: commercePolicy.deliveryTimes.maxBusinessDays,
            }),
            loading: t("loading"),
            loadingDetail: t("loadingDetail"),
            retryButton: t("retryButton"),
            powered: t("powered"),
            unavailable: t("unavailable"),
            invalid: t("invalid"),
            inventory: t("inventory"),
            retry: t("retry"),
            finishNote: t("finishNote"),
            cancel: t("cancel"),
            canceled: t("canceled"),
            colors: {
              black: t("colors.black"),
              gold: t("colors.gold"),
              silver: t("colors.silver"),
            },
            lamp: t("lamp"),
            lamps: t("lamps"),
            perPack: t("perPack"),
            represented: t("represented"),
            composition: t("composition"),
          }}
        />
      </Container>
    </section>
  );
}
