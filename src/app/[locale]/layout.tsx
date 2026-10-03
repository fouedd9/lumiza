import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, Manrope } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { GoogleAnalytics } from "@/features/analytics/google-analytics";
import { MetaPixelProvider } from "@/features/analytics/meta-pixel-provider";
import { MicrosoftClarity } from "@/features/analytics/microsoft-clarity";
import { ConsentManager } from "@/features/consent/consent-manager";
import { WhatsAppContact } from "@/components/contact/whatsapp-contact";
import { getCanonicalSiteUrl } from "@/config/site";
import { getProductMedia } from "@/features/product/data/product-media";
import { routing } from "@/i18n/routing";
import "@/styles/globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["600"],
  style: ["italic"],
  variable: "--font-cormorant",
  display: "swap",
});

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Pick<LocaleLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    return {};
  }

  const t = await getTranslations({ locale, namespace: "Metadata" });
  const siteUrl = getCanonicalSiteUrl();
  const canonicalPath = `/${locale}`;
  const canonicalUrl = new URL(canonicalPath, siteUrl);
  const ogLocales = {
    fr: "fr_FR",
    en: "en_GB",
    de: "de_DE",
  } as const;
  const heroMedia = getProductMedia(locale).find(
    (item) => item.kind === "product" && item.color === "gold",
  )!;

  return {
    metadataBase: siteUrl,
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: canonicalPath,
      languages: {
        ...Object.fromEntries(
          routing.locales.map((supportedLocale) => [
            supportedLocale,
            `/${supportedLocale}`,
          ]),
        ),
        "x-default": "/fr",
      },
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: canonicalUrl,
      siteName: "LUMIZA",
      locale: ogLocales[locale],
      alternateLocale: routing.locales
        .filter((candidate) => candidate !== locale)
        .map((candidate) => ogLocales[candidate]),
      type: "website",
      images: [
        {
          url: new URL(heroMedia.src, siteUrl),
          width: heroMedia.width,
          height: heroMedia.height,
          alt: heroMedia.alt,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: t("title"),
      description: t("description"),
      images: [new URL(heroMedia.src, siteUrl)],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${manrope.variable} ${dmSans.variable} ${cormorant.variable}`}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider messages={messages}>
            <GoogleAnalytics
              measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
            />
            <MetaPixelProvider
              pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID}
            />
            <MicrosoftClarity
              projectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID}
              production={
                process.env.NODE_ENV === "production" &&
                process.env.VERCEL_ENV === "production"
              }
            />
            <Header />
            <main>{children}</main>
            <Footer />
            <ConsentManager />
            <WhatsAppContact />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
