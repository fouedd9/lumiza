import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProductExperience } from "@/features/product/components/product-experience";
import type { ResolvedProductMedia } from "@/features/product/data/product-media";

const media: ResolvedProductMedia[] = [
  ...(["black", "gold", "silver"] as const).map((color) => ({
    id: color,
    src: `/images/product/lumiza-${color}.webp`,
    width: 800,
    height: 800,
    alt: `${color} LUMIZA`,
    kind: "product" as const,
    color,
    temporary: false,
  })),
];

describe("ProductExperience colours", () => {
  it("shows the real photograph matching each selected finish", async () => {
    const user = userEvent.setup();
    render(
      <ProductExperience
        media={media}
        colors={["black", "gold", "silver"]}
        colorLabels={{ black: "Black", gold: "Gold", silver: "Silver" }}
        labels={{
          gallery: "Gallery",
          previous: "Previous",
          next: "Next",
          expand: "Expand",
          close: "Close",
          colors: "Planned finish",
          provisional: "Subject to confirmation",
          selected: "Selection",
          missingImage: "Image unavailable",
        }}
      />,
    );

    expect(screen.getByAltText("black LUMIZA")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gold" }));
    expect(screen.getByText("Selection: Gold")).toBeInTheDocument();
    expect(screen.getByAltText("gold LUMIZA")).toBeInTheDocument();
    expect(screen.queryByText("Image unavailable")).not.toBeInTheDocument();
  });
});
