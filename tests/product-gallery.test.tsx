import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ProductGallery } from "@/features/product/components/product-gallery";
import type { ResolvedProductMedia } from "@/features/product/data/product-media";

const media: ResolvedProductMedia[] = [
  {
    id: "front",
    src: "/images/product/lumiza-black.webp",
    width: 800,
    height: 800,
    alt: "Front view",
    kind: "product",
    temporary: false,
  },
  {
    id: "detail",
    src: "/images/product/lumiza-gold.webp",
    width: 800,
    height: 800,
    alt: "Detail view",
    kind: "product",
    temporary: false,
  },
];

const labels = {
  gallery: "Product gallery",
  previous: "Previous image",
  next: "Next image",
  expand: "Expand image",
  close: "Close image",
};

function GalleryHarness() {
  const [activeId, setActiveId] = useState("front");
  return (
    <ProductGallery
      media={media}
      activeId={activeId}
      onActiveChange={setActiveId}
      labels={labels}
    />
  );
}

describe("ProductGallery", () => {
  it("moves through images with accessible controls", async () => {
    const user = userEvent.setup();
    render(<GalleryHarness />);

    expect(screen.getByAltText("Front view")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByAltText("Detail view")).toBeInTheDocument();
  });

  it("opens and closes the expanded image dialog", async () => {
    const user = userEvent.setup();
    render(<GalleryHarness />);

    await user.click(screen.getByRole("button", { name: "Expand image" }));
    expect(
      screen.getByRole("dialog", { name: "Front view" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close image" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
