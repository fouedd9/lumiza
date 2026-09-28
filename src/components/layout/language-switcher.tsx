"use client";

import { useLocale } from "next-intl";
import { useRef, useTransition, type MouseEvent } from "react";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
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
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function changeLocale(
    event: MouseEvent<HTMLAnchorElement>,
    nextLocale: AppLocale,
  ) {
    event.preventDefault();
    startTransition(() => {
      const suffix = `${window.location.search}${window.location.hash}`;
      router.replace(`${pathname}${suffix}`, {
        locale: nextLocale,
        scroll: false,
      });
    });
    detailsRef.current?.removeAttribute("open");
  }

  return (
    <details ref={detailsRef} className="group relative" aria-busy={isPending}>
      <summary
        aria-label={label}
        title={languageNames[locale]}
        className="border-border bg-surface-elevated hover:border-primary focus-visible:border-primary focus-visible:ring-primary/30 flex min-h-10 cursor-pointer list-none items-center rounded-full border py-2 pr-3 pl-3 text-xs font-bold tracking-[0.08em] uppercase transition-colors outline-none focus-visible:ring-2"
      >
        {locale.toUpperCase()}
        <span aria-hidden="true" className="ml-2 text-xs">
          ↓
        </span>
      </summary>
      <nav
        aria-label={label}
        className="border-border bg-surface-elevated absolute right-0 z-40 mt-2 min-w-32 overflow-hidden rounded-2xl border p-1 shadow-xl"
      >
        {routing.locales.map((supportedLocale) => (
          <Link
            key={supportedLocale}
            href={pathname}
            locale={supportedLocale}
            hrefLang={supportedLocale}
            aria-current={supportedLocale === locale ? "page" : undefined}
            onClick={(event) => changeLocale(event, supportedLocale)}
            className="hover:bg-surface focus-visible:bg-surface block min-h-10 rounded-xl px-3 py-2 text-sm font-semibold outline-none"
          >
            {languageNames[supportedLocale]}
          </Link>
        ))}
      </nav>
    </details>
  );
}
