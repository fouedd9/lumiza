"use client";

import { useState } from "react";

import type { ResolvedProductMedia } from "../data/product-media";
import type { ProductColor } from "../types/product";
import { ProductColors } from "./product-colors";
import { ProductGallery } from "./product-gallery";

type ProductExperienceProps = {
  media: ResolvedProductMedia[];
  colors: readonly ProductColor[];
  colorLabels: Record<ProductColor, string>;
  labels: {
    gallery: string;
    previous: string;
    next: string;
    expand: string;
    close: string;
    colors: string;
    provisional: string;
    selected: string;
    missingImage: string;
  };
};

export function ProductExperience({
  media,
  colors,
  colorLabels,
  labels,
}: ProductExperienceProps) {
  const [activeId, setActiveId] = useState(media[0].id);
  const [selectedColor, setSelectedColor] = useState<ProductColor>(colors[0]);
  const [missingImage, setMissingImage] = useState(
    !media.some((item) => item.color === colors[0]),
  );

  function selectColor(color: ProductColor) {
    setSelectedColor(color);
    const matchingImage = media.find((item) => item.color === color);

    if (matchingImage) {
      setActiveId(matchingImage.id);
      setMissingImage(false);
    } else {
      setMissingImage(true);
    }
  }

  return (
    <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
      <ProductGallery
        media={media}
        activeId={activeId}
        onActiveChange={setActiveId}
        labels={labels}
      />
      <div className="lg:sticky lg:top-32">
        <ProductColors
          colors={colors}
          selected={selectedColor}
          onChange={selectColor}
          labels={colorLabels}
          legend={labels.colors}
          provisionalLabel={labels.provisional}
        />
        <p className="text-foreground mt-6 font-bold" aria-live="polite">
          {labels.selected}: {colorLabels[selectedColor]}
        </p>
        {missingImage ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {labels.missingImage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
