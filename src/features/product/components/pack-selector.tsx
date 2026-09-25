"use client";

import { getPackSavingsInCents } from "../data/pricing";
import type { ProductPack } from "../types/product";
import type { AppLocale } from "@/i18n/routing";
import { formatCurrency } from "@/lib/utils/format-currency";

export type PackLabels = {
  legend: string;
  lamp: string;
  lamps: string;
  save: string;
  professional: string;
};

export function PackSelector({
  packs,
  selected,
  onChange,
  locale,
  labels,
}: {
  packs: readonly ProductPack[];
  selected: ProductPack["id"];
  onChange: (id: ProductPack["id"]) => void;
  locale: AppLocale;
  labels: PackLabels;
}) {
  const soloPrice = packs.find((pack) => pack.id === "solo")?.priceInCents;
  return (
    <fieldset>
      <legend className="mb-3 font-bold">{labels.legend}</legend>
      <div className="space-y-3">
        {packs.map((pack) => {
          const savings =
            soloPrice === undefined
              ? 0
              : getPackSavingsInCents(pack, soloPrice);
          const active = selected === pack.id;
          return (
            <label
              key={pack.id}
              className={`focus-within:outline-primary flex min-h-23 cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 ${active ? "border-primary bg-primary/10" : "border-border bg-surface-elevated hover:border-primary/70"} ${pack.id === "pro" && active ? "ring-accent ring-2" : ""}`}
            >
              <input
                type="radio"
                name="lumiza-pack"
                value={pack.id}
                checked={active}
                onChange={() => onChange(pack.id)}
                className="accent-primary size-5 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-extrabold">
                    {pack.label}
                  </span>
                  {pack.id === "pro" ? (
                    <span className="bg-accent text-accent-foreground rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase">
                      {labels.professional}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  {pack.quantity}{" "}
                  {pack.quantity === 1 ? labels.lamp : labels.lamps}
                </span>
                {savings > 0 ? (
                  <span className="text-foreground mt-1 block text-xs font-semibold">
                    {labels.save} {formatCurrency(savings, "EUR", locale)}
                  </span>
                ) : null}
              </span>
              <span className="font-display shrink-0 text-right text-lg font-extrabold">
                {formatCurrency(pack.priceInCents, "EUR", locale)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
