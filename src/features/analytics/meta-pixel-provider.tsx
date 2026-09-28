"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { CONSENT_CHANGED_EVENT, readConsent } from "@/features/consent/consent";

import {
  META_READY_EVENT,
  initializeMetaPixel,
  revokeMetaConsent,
  trackMetaPageView,
  validMetaPixelId,
} from "./meta-pixel";

export function MetaPixelProvider({
  pixelId,
}: {
  pixelId: string | undefined;
}) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const previousMarketing = useRef(false);

  useEffect(() => {
    if (!validMetaPixelId(pixelId)) return;

    const syncConsent = () => {
      const marketing = readConsent()?.marketing === true;
      if (marketing) {
        const newlyGranted = !previousMarketing.current;
        initializeMetaPixel(pixelId);
        setEnabled(true);
        trackMetaPageView(pathname, newlyGranted);
        if (newlyGranted) window.dispatchEvent(new Event(META_READY_EVENT));
      } else {
        revokeMetaConsent();
      }
      previousMarketing.current = marketing;
    };

    syncConsent();
    window.addEventListener(CONSENT_CHANGED_EVENT, syncConsent);
    window.addEventListener("storage", syncConsent);
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, syncConsent);
      window.removeEventListener("storage", syncConsent);
    };
  }, [pathname, pixelId]);

  if (!validMetaPixelId(pixelId) || !enabled) return null;
  return (
    <Script
      id="lumiza-meta-pixel"
      src="https://connect.facebook.net/en_US/fbevents.js"
      strategy="afterInteractive"
    />
  );
}
