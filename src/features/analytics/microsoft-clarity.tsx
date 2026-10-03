"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { CONSENT_CHANGED_EVENT, readConsent } from "@/features/consent/consent";

type ClarityCommand = ((...args: unknown[]) => void) & { q?: IArguments[] };

declare global {
  interface Window {
    clarity?: ClarityCommand;
  }
}

const denied = { ad_Storage: "denied", analytics_Storage: "denied" } as const;
const analyticsGranted = {
  ad_Storage: "denied",
  analytics_Storage: "granted",
} as const;

export function validClarityProjectId(
  value: string | undefined,
): value is string {
  return /^[a-z0-9]+$/i.test(value ?? "");
}

export function isSensitiveCommercePath(pathname: string) {
  return /^\/(?:fr|en|de)\/(?:checkout|order\/confirmation)(?:\/|$)/.test(
    pathname,
  );
}

function clarityQueue() {
  window.clarity ??= function clarity() {
    // Clarity's loader consumes native Arguments queued before it loads.
    // eslint-disable-next-line prefer-rest-params
    (window.clarity!.q ??= []).push(arguments);
  };
  return window.clarity;
}

export function MicrosoftClarity({
  projectId,
  production,
}: {
  projectId: string | undefined;
  production: boolean;
}) {
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);
  const available = production && validClarityProjectId(projectId);
  const sensitive = isSensitiveCommercePath(pathname);

  useEffect(() => {
    if (!available) return;
    const syncConsent = () => {
      const allowed = readConsent()?.analytics === true && !sensitive;
      if (allowed) {
        clarityQueue()("consentv2", analyticsGranted);
        setLoaded(true);
      } else if (window.clarity) {
        window.clarity("consentv2", denied);
      }
    };
    syncConsent();
    window.addEventListener(CONSENT_CHANGED_EVENT, syncConsent);
    window.addEventListener("storage", syncConsent);
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, syncConsent);
      window.removeEventListener("storage", syncConsent);
    };
  }, [available, sensitive]);

  if (!available || sensitive || !loaded) return null;
  return (
    <Script
      id="lumiza-microsoft-clarity"
      src={`https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`}
      strategy="afterInteractive"
    />
  );
}
