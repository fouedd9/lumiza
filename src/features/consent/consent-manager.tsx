"use client";

import { useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  OPEN_CONSENT_EVENT,
  CONSENT_CHANGED_EVENT,
  CONSENT_STORAGE_KEY,
  readConsent,
  saveConsent,
} from "./consent";

function subscribeConsent(onChange: () => void) {
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function consentSnapshot() {
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}
const noSubscribe = () => () => {};

export function ConsentManager() {
  const t = useTranslations("Consent");
  const ready = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const raw = useSyncExternalStore(
    subscribeConsent,
    consentSnapshot,
    () => null,
  );
  const decision = useMemo(() => readConsent({ getItem: () => raw }), [raw]);
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const reopen = () => {
      const current = readConsent();
      setAnalytics(current?.analytics ?? false);
      setMarketing(current?.marketing ?? false);
      previousFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusables = [
        ...dialog.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled])",
        ),
      ];
      if (!focusables.length) return;
      const first = focusables[0],
        last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
    previousFocus.current?.focus();
  }
  function choose(choices: { analytics: boolean; marketing: boolean }) {
    try {
      saveConsent(choices);
      close();
    } catch {
      /* Storage can be disabled; optional scripts remain off. */
    }
  }
  function customize() {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setAnalytics(decision?.analytics ?? false);
    setMarketing(decision?.marketing ?? false);
    setOpen(true);
  }

  if (!ready) return null;
  return (
    <>
      {!decision && !open ? (
        <aside
          aria-label={t("title")}
          className="border-border bg-background fixed inset-x-3 bottom-3 z-[110] mx-auto max-w-3xl rounded-2xl border p-5 shadow-2xl sm:p-6"
        >
          <h2 className="font-display text-xl font-bold">{t("title")}</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {t("description")}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => choose({ analytics: true, marketing: true })}
              className="bg-primary text-primary-foreground min-h-11 rounded-full px-5 font-bold"
            >
              {t("acceptAll")}
            </button>
            <button
              type="button"
              onClick={() => choose({ analytics: false, marketing: false })}
              className="border-border min-h-11 rounded-full border px-5 font-bold"
            >
              {t("rejectOptional")}
            </button>
            <button
              type="button"
              onClick={customize}
              className="min-h-11 px-4 underline"
            >
              {t("customize")}
            </button>
          </div>
        </aside>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="consent-dialog-title"
            aria-describedby="consent-dialog-description"
            className="bg-background text-foreground max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="consent-dialog-title"
                className="font-display text-2xl font-bold"
              >
                {t("dialogTitle")}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t("close")}
                className="min-h-11 min-w-11 text-2xl"
              >
                ×
              </button>
            </div>
            <p
              id="consent-dialog-description"
              className="text-muted-foreground mt-3 text-sm"
            >
              {t("description")}
            </p>
            <div className="border-border mt-6 space-y-5 border-t pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{t("necessary")}</p>
                  <p className="text-muted-foreground text-sm">
                    {t("necessaryDetail")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label={t("necessary")}
                />
              </div>
              <label className="flex min-h-11 items-center justify-between gap-4 font-semibold">
                {t("analytics")}
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                />
              </label>
              <label className="flex min-h-11 items-center justify-between gap-4 font-semibold">
                {t("marketing")}
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(event) => setMarketing(event.target.checked)}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => choose({ analytics, marketing })}
              className="bg-primary text-primary-foreground mt-7 min-h-11 rounded-full px-6 font-bold"
            >
              {t("save")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
