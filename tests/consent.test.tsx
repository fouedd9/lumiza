import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import en from "@/../messages/en.json";
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  optionalConsent,
  readConsent,
} from "@/features/consent/consent";
import { ConsentManager } from "@/features/consent/consent-manager";
import { ConsentPreferencesButton } from "@/features/consent/consent-preferences-button";

function view() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ConsentManager />
      <ConsentPreferencesButton label="Cookie preferences" />
    </NextIntlClientProvider>,
  );
}

describe("versioned optional consent", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults both optional categories off and rejects an older version", () => {
    expect(optionalConsent()).toEqual({ analytics: false, marketing: false });
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        version: CONSENT_VERSION - 1,
        necessary: true,
        analytics: true,
        marketing: true,
        decidedAt: new Date().toISOString(),
      }),
    );
    expect(readConsent()).toBeNull();
    expect(optionalConsent()).toEqual({ analytics: false, marketing: false });
  });

  it("accepts all, persists and lets the footer reopen granular preferences", async () => {
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Accept all" }),
    );
    expect(optionalConsent()).toEqual({ analytics: true, marketing: true });
    expect(readConsent()?.necessary).toBe(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Cookie preferences" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Cookie preferences" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Necessary" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Marketing" }));
    await userEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(optionalConsent()).toEqual({ analytics: true, marketing: false });
  });

  it("rejects optional categories and allows custom choices", async () => {
    view();
    await userEvent.click(
      await screen.findByRole("button", { name: "Reject optional" }),
    );
    expect(optionalConsent()).toEqual({ analytics: false, marketing: false });
    await userEvent.click(
      screen.getByRole("button", { name: "Cookie preferences" }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Marketing" }));
    await userEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(optionalConsent()).toEqual({ analytics: false, marketing: true });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
