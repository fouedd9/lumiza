import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import { Container } from "../ui/container";
import { FooterPayment } from "./footer-payment";
import { ConsentPreferencesButton } from "@/features/consent/consent-preferences-button";
import { business } from "@/config/business";
import { socialLinks } from "@/config/social";

function SocialIcon({ name }: { name: "facebook" | "instagram" }) {
  return name === "facebook" ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-5"
    >
      <path d="M13.5 21v-8.2h2.8l.4-3.2h-3.2V7.5c0-.9.3-1.5 1.6-1.5h1.7V3.1A22 22 0 0 0 14.3 3C11.8 3 10 4.5 10 7.2v2.4H7.2v3.2H10V21h3.5Z" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="size-5"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export async function Footer() {
  const t = await getTranslations("Footer");

  return (
    <footer className="border-border bg-surface border-t py-12">
      <Container className="text-muted-foreground grid gap-10 text-sm sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_0.8fr]">
        <div>
          <Link
            href="/"
            className="text-foreground text-xl font-extrabold tracking-[-0.05em]"
          >
            lumiza<span className="text-primary">.</span>
          </Link>
          <p className="mt-5 max-w-md leading-6">{t("brandNote")}</p>
          <div
            className="mt-6 flex items-center gap-2"
            aria-label={t("socialLabel")}
          >
            {(["facebook", "instagram"] as const).map((name) => {
              const icon = <SocialIcon name={name} />;
              const className =
                "border-border text-muted-foreground inline-flex size-9 items-center justify-center rounded-full border";
              return socialLinks[name] ? (
                <a
                  key={name}
                  href={socialLinks[name]}
                  aria-label={t(name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${className} hover:text-foreground focus-visible:outline-primary focus-visible:outline-2`}
                >
                  {icon}
                </a>
              ) : (
                <span key={name} className={className} aria-hidden="true">
                  {icon}
                </span>
              );
            })}
          </div>
        </div>
        <nav aria-label={t("navigationLabel")}>
          <p className="text-foreground mb-4 font-bold">{t("navigation")}</p>
          <ul className="space-y-3">
            <li>
              <Link href="/#advantages">{t("advantages")}</Link>
            </li>
            <li>
              <Link href="/#product">{t("product")}</Link>
            </li>
            <li>
              <Link href="/#offers">{t("offers")}</Link>
            </li>
            <li>
              <Link href="/#questions">{t("questions")}</Link>
            </li>
          </ul>
        </nav>
        <div>
          <p className="text-foreground mb-4 font-bold">{t("information")}</p>
          <nav aria-label={t("information")}>
            <ul className="space-y-3">
              <li>
                <Link href="/legal">{t("legal")}</Link>
              </li>
              <li>
                <Link href="/privacy">{t("privacy")}</Link>
              </li>
              <li>
                <Link href="/terms">{t("terms")}</Link>
              </li>
              <li>
                <Link href="/shipping-returns">{t("shippingReturns")}</Link>
              </li>
              <li>
                <Link href="/cookies">{t("cookies")}</Link>
              </li>
              <li>
                <ConsentPreferencesButton label={t("cookiePreferences")} />
              </li>
            </ul>
          </nav>
          <p className="mt-5 leading-6 break-all">
            {business.supportEmail ? (
              <a href={`mailto:${business.supportEmail}`}>
                {business.supportEmail}
              </a>
            ) : (
              t("contactPending")
            )}
          </p>
          <FooterPayment
            title={t("securePayment")}
            reassurance={t("paymentReassurance")}
            description={t("paymentDescription")}
          />
        </div>
      </Container>
      <Container className="border-border text-muted-foreground mt-10 border-t pt-6 text-xs">
        <p>© {new Date().getFullYear()} LUMIZA</p>
      </Container>
    </footer>
  );
}
