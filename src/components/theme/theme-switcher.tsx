"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const themes = ["light", "dark", "system"] as const;
type ThemeName = (typeof themes)[number];

const icons: Record<ThemeName, string> = {
  light: "☀",
  dark: "◐",
  system: "◫",
};

const emptySubscribe = () => () => undefined;

type ThemeSwitcherProps = {
  label: string;
  labels: Record<ThemeName, string>;
};

export function ThemeSwitcher({ label, labels }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <fieldset
      aria-label={label}
      className="border-border bg-surface-elevated flex rounded-full border p-1"
    >
      <legend className="sr-only">{label}</legend>
      {themes.map((option) => {
        const isActive = mounted && theme === option;

        return (
          <button
            key={option}
            type="button"
            aria-label={labels[option]}
            aria-pressed={isActive}
            className="text-muted-foreground hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-primary grid size-8 place-items-center rounded-full text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => setTheme(option)}
          >
            <span aria-hidden="true">{icons[option]}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
