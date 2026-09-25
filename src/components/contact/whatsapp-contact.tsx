"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { whatsappHref } from "@/config/business";
import { CONSENT_CHANGED_EVENT, readConsent } from "@/features/consent/consent";
import { usePathname } from "@/i18n/navigation";

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function WhatsAppContact() {
  const t = useTranslations("Contact");
  const pathname = usePathname();
  const [purchaseControlsVisible, setPurchaseControlsVisible] = useState(false);
  const consentDecided = useSyncExternalStore(
    subscribe,
    () => readConsent() !== null,
    () => false,
  );
  const href = whatsappHref(undefined, t("message"));

  useEffect(() => {
    const controls = document.querySelectorAll(
      "[data-add-to-cart], [data-product-gallery]",
    );
    if (!controls.length) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        setPurchaseControlsVisible(visible.size > 0);
      },
      { threshold: 0 },
    );
    controls.forEach((control) => observer.observe(control));
    return () => observer.disconnect();
  }, [pathname]);

  // Keep the consent banner and the embedded payment interface unobstructed.
  if (
    !href ||
    !consentDecided ||
    purchaseControlsVisible ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/order/confirmation")
  )
    return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("whatsapp")}
      className="focus-visible:outline-primary fixed right-[calc(1rem+env(safe-area-inset-right))] bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-[#10251a] shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 sm:right-6 sm:bottom-6"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5 shrink-0"
        aria-hidden="true"
      >
        <path d="M20.2 11.5a8.2 8.2 0 0 1-12.1 7.2L3.5 20l1.3-4.4a8.2 8.2 0 1 1 15.4-4.1Z" />
        <path d="M8.5 8.1c-.3.3-.6 1-.4 1.7.5 1.8 2.7 4 4.6 4.7.8.3 1.4 0 1.8-.4l.7-.9-2.1-.9-.8.8a7.5 7.5 0 0 1-2.7-2.7l.8-.8-.9-2.1-1 .6Z" />
      </svg>
      <span className="hidden sm:inline">{t("whatsapp")}</span>
    </a>
  );
}
