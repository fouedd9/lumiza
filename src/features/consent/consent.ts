import { z } from "zod";

export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = "lumiza-consent";
export const CONSENT_CHANGED_EVENT = "lumiza-consent-changed";
export const OPEN_CONSENT_EVENT = "lumiza-open-consent";

const consentSchema = z.object({
  version: z.literal(CONSENT_VERSION),
  necessary: z.literal(true),
  analytics: z.boolean(),
  marketing: z.boolean(),
  decidedAt: z.string().datetime(),
});

export type ConsentDecision = z.infer<typeof consentSchema>;

export function readConsent(
  storage?: Pick<Storage, "getItem">,
): ConsentDecision | null {
  const source =
    storage ??
    (typeof window === "undefined" ? undefined : window.localStorage);
  if (!source) return null;
  try {
    const raw = source.getItem(CONSENT_STORAGE_KEY);
    return raw ? (consentSchema.safeParse(JSON.parse(raw)).data ?? null) : null;
  } catch {
    return null;
  }
}

/** Step 5 must call this before loading any optional script. */
export function optionalConsent(storage?: Pick<Storage, "getItem">) {
  const decision = readConsent(storage);
  return {
    analytics: decision?.analytics === true,
    marketing: decision?.marketing === true,
  };
}

export function saveConsent(
  choices: { analytics: boolean; marketing: boolean },
  storage: Pick<Storage, "setItem"> = window.localStorage,
): ConsentDecision {
  const decision: ConsentDecision = {
    version: CONSENT_VERSION,
    necessary: true,
    analytics: choices.analytics,
    marketing: choices.marketing,
    decidedAt: new Date().toISOString(),
  };
  storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(decision));
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
  return decision;
}
