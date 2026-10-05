import { getTranslations } from "next-intl/server";

import { business, whatsappHref } from "@/config/business";
import { socialLinks } from "@/config/social";
import type { AppLocale } from "@/i18n/routing";

export async function PrivacyContact({ locale }: { locale: AppLocale }) {
  const t = await getTranslations({
    locale,
    namespace: "Legal.privacy.contact",
  });
  const contacts = [
    {
      label: t("email"),
      text: business.supportEmail,
      href: `mailto:${business.supportEmail}`,
      external: false,
    },
    {
      label: "WhatsApp",
      text: "+33 7 67 65 30 82",
      href: whatsappHref(),
      external: true,
    },
    {
      label: "Facebook",
      text: "Facebook LUMIZA",
      href: socialLinks.facebook,
      external: true,
    },
    {
      label: "Instagram",
      text: "Instagram LUMIZA",
      href: socialLinks.instagram,
      external: true,
    },
  ];

  return (
    <section aria-labelledby="privacy-contact-title">
      <h2
        id="privacy-contact-title"
        className="font-display text-2xl font-bold break-words"
      >
        {t("title")}
      </h2>
      <p className="text-muted-foreground mt-3 leading-7">{t("description")}</p>
      <dl className="border-border mt-4 divide-y rounded-xl border px-5">
        {contacts
          .filter((contact) => contact.href)
          .map((contact) => (
            <div
              key={contact.label}
              className="grid gap-1 py-3 sm:grid-cols-2 sm:gap-2"
            >
              <dt className="font-semibold break-words">{contact.label}</dt>
              <dd className="min-w-0">
                <a
                  href={contact.href!}
                  target={contact.external ? "_blank" : undefined}
                  rel={contact.external ? "noopener noreferrer" : undefined}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-primary inline-flex min-h-11 items-center py-2 leading-6 break-all underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  {contact.text}
                </a>
              </dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
