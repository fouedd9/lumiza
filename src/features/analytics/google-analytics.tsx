"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { CONSENT_CHANGED_EVENT, readConsent } from "@/features/consent/consent";

import {
  configureGoogleTag,
  setDefaultGoogleConsent,
  updateGoogleConsent,
  validMeasurementId,
} from "./ga4";

export function GoogleAnalytics({
  measurementId,
}: {
  measurementId: string | undefined;
}) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!validMeasurementId(measurementId)) return;
    setDefaultGoogleConsent(measurementId);

    const syncConsent = () => {
      const decision = readConsent();
      updateGoogleConsent(measurementId, decision);
      if (decision?.analytics) {
        configureGoogleTag(measurementId);
        setEnabled(true);
      }
    };

    syncConsent();
    window.addEventListener(CONSENT_CHANGED_EVENT, syncConsent);
    window.addEventListener("storage", syncConsent);
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, syncConsent);
      window.removeEventListener("storage", syncConsent);
    };
  }, [measurementId]);

  if (!validMeasurementId(measurementId) || !enabled) return null;
  return (
    <Script
      id="lumiza-google-analytics"
      src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
      strategy="afterInteractive"
    />
  );
}
