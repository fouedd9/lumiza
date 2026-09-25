"use client";

import { OPEN_CONSENT_EVENT } from "./consent";

export function ConsentPreferencesButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className="text-left underline underline-offset-4 focus-visible:outline-2"
    >
      {label}
    </button>
  );
}
