"use client";

import type { ProductColor } from "../types/product";

type ProductColorsProps = {
  colors: readonly ProductColor[];
  selected: ProductColor | null;
  onChange: (color: ProductColor) => void;
  labels: Record<ProductColor, string>;
  legend: string;
  provisionalLabel: string;
};

export function ProductColors({
  colors,
  selected,
  onChange,
  labels,
  legend,
  provisionalLabel,
}: ProductColorsProps) {
  return (
    <fieldset>
      <legend className="font-bold">{legend}</legend>
      <div className="mt-4 flex flex-wrap gap-3">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-pressed={selected === color}
            onClick={() => onChange(color)}
            className="border-border bg-surface-elevated aria-pressed:border-primary focus-visible:outline-primary inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-3"
          >
            <span
              aria-hidden="true"
              className={`color-swatch color-swatch-${color}`}
            />
            {labels[color]}
          </button>
        ))}
      </div>
      {provisionalLabel ? (
        <p className="text-muted-foreground mt-4 text-sm">{provisionalLabel}</p>
      ) : null}
    </fieldset>
  );
}
