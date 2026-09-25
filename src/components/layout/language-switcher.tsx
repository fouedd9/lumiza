"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { type AppLocale, routing } from "@/i18n/routing";

type LanguageSwitcherProps = {
  label: string;
  languageNames: Record<AppLocale, string>;
};

export function LanguageSwitcher({
  label,
  languageNames,
}: LanguageSwitcherProps) {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changeLocale(nextLocale: AppLocale) {
    startTransition(() => {
      const suffix = `${window.location.search}${window.location.hash}`;
      router.replace(`${pathname}${suffix}`, {
        locale: nextLocale,
        scroll: false,
      });
    });
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        title={languageNames[locale]}
        className="border-border bg-surface-elevated hover:border-primary focus-visible:border-primary focus-visible:ring-primary/30 min-h-10 cursor-pointer appearance-none rounded-full border py-2 pr-7 pl-3 text-xs font-bold tracking-[0.08em] uppercase transition-colors outline-none focus-visible:ring-2 disabled:cursor-wait"
        disabled={isPending}
        value={locale}
        onChange={(event) => changeLocale(event.target.value as AppLocale)}
      >
        {routing.locales.map((supportedLocale) => (
          <option key={supportedLocale} value={supportedLocale}>
            {supportedLocale.toUpperCase()}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 text-xs"
      >
        ↓
      </span>
    </label>
  );
}
