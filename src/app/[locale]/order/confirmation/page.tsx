import { hasLocale } from "next-intl";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { isCommerceReady } from "@/config/commerce-env.server";
import { checkConfirmation } from "@/features/commerce/services/confirmation";
import { FINISHES } from "@/features/commerce/schemas/cart";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; session_id?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Confirmation" });
  const checkoutT = await getTranslations({ locale, namespace: "Checkout" });
  const query = await searchParams;
  let result: Awaited<ReturnType<typeof checkConfirmation>> = {
    state: "invalid",
  };
  if (isCommerceReady()) {
    try {
      result = await checkConfirmation(query.token, query.session_id);
    } catch {
      result = { state: "invalid" };
    }
  }
  const titleKey = `${result.state}Title` as const;
  const bodyKey = `${result.state}Body` as const;
  return (
    <section className="py-20 sm:py-32">
      <Container>
        <div
          className="border-border bg-surface-elevated mx-auto max-w-2xl rounded-[2rem] border p-8 sm:p-12"
          role="status"
        >
          <span className="text-primary text-4xl" aria-hidden="true">
            ✦
          </span>
          <h1 className="font-display mt-5 text-3xl font-extrabold tracking-tight sm:text-5xl">
            {t(titleKey)}
          </h1>
          <p className="text-muted-foreground mt-5 leading-7">{t(bodyKey)}</p>
          {result.reference ? (
            <p className="mt-7 font-bold">
              {t("reference")}: {result.reference}
            </p>
          ) : null}
          {result.items?.length ? (
            <ul className="mt-6 space-y-4">
              {result.items.map((item, index) => (
                <li key={index} className="border-border rounded-xl border p-4">
                  <p className="font-bold">
                    LUMIZA · {item.pack.toUpperCase()} · {item.unitQuantity}{" "}
                    {item.unitQuantity === 1
                      ? checkoutT("lamp")
                      : checkoutT("lamps")}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {checkoutT("quantity")}: {item.quantity} ·{" "}
                    {checkoutT("composition")}
                  </p>
                  <ul>
                    {FINISHES.filter(
                      (finish) => item.composition[finish] > 0,
                    ).map((finish) => (
                      <li key={finish}>
                        {item.composition[finish]} ×{" "}
                        {checkoutT(`colors.${finish}`)}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            href="/#offers"
            className="bg-foreground text-background mt-9 inline-flex min-h-11 items-center rounded-full px-6 font-bold"
          >
            {t("back")}
          </Link>
        </div>
      </Container>
    </section>
  );
}
