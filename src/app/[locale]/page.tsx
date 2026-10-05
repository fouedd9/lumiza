import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";

import { FaqSection } from "@/components/sections/faq-section";
import { FinalCtaSection } from "@/components/sections/final-cta-section";
import { HeroSection } from "@/components/sections/hero-section";
import { ReviewsSection } from "@/components/sections/reviews-section";
import { UseCasesSection } from "@/components/sections/use-cases-section";
import { ProductBenefits } from "@/features/product/components/product-benefits";
import { ProductStructuredData } from "@/features/product/components/product-structured-data";
import { PurchaseSection } from "@/features/product/components/purchase-section";
import { routing } from "@/i18n/routing";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

// Active Supabase packs and variants must be read for each request, not frozen at build time.
export const dynamic = "force-dynamic";

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  return (
    <>
      <ProductStructuredData locale={locale} />
      <HeroSection locale={locale} />
      <PurchaseSection locale={locale} />
      <ProductBenefits locale={locale} />
      <UseCasesSection locale={locale} />
      <FaqSection locale={locale} />
      <ReviewsSection locale={locale} />
      <FinalCtaSection locale={locale} />
    </>
  );
}
