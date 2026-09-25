import { getTranslations } from "next-intl/server";

import { Container } from "@/components/ui/container";
import { lumizaProduct } from "@/features/product/data/product";
import { CartShop } from "@/features/commerce/components/cart-shop";
import type { AppLocale } from "@/i18n/routing";

import { OfferCard } from "./offer-card";

export async function OffersSection({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: "Home.offers" });
  const soloPriceInCents = lumizaProduct.packs[0].priceInCents;

  return (
    <section id="offers" className="offers-section scroll-mt-24 py-20 sm:py-28">
      <Container>
        <div className="mb-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-primary mb-4 text-xs font-bold tracking-[0.18em] uppercase">
              {t("eyebrow")}
            </p>
            <h2 className="font-display max-w-3xl text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.95] font-extrabold tracking-[-0.06em] text-white">
              {t("title")}
            </h2>
          </div>
          <p className="max-w-xl leading-7 text-white/65 lg:justify-self-end">
            {t("description", { productName: lumizaProduct.name[locale] })}
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-3 md:items-stretch">
          {lumizaProduct.packs.map((pack) => (
            <OfferCard
              key={pack.id}
              pack={pack}
              locale={locale}
              lampLabel={t("lamp")}
              soloNote={t("soloNote")}
              selectLabel={t("select")}
              professionalLabel={t("professional")}
              savingsLabel={t("savings")}
              soloPriceInCents={soloPriceInCents}
            />
          ))}
        </div>
        <CartShop
          packs={lumizaProduct.packs}
          locale={locale}
          labels={{
            add: t("cart.add"),
            cart: t("cart.title"),
            empty: t("cart.empty"),
            checkout: t("cart.checkout"),
            remove: t("cart.remove"),
            quantity: t("cart.quantity"),
            color: t("cart.color"),
            subtotal: t("cart.subtotal"),
            max: t("cart.max"),
            colors: {
              black: t("cart.colors.black"),
              gold: t("cart.colors.gold"),
              silver: t("cart.colors.silver"),
            },
          }}
        />
        <div className="mt-8 grid gap-3 text-sm text-white/60 sm:grid-cols-2">
          <p>{t("packNote")}</p>
          <p className="sm:text-right">{t("colorNote")}</p>
        </div>
        <p className="mt-5 text-sm text-white/45">{t("pricingNote")}</p>
      </Container>
    </section>
  );
}
