import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import fr from "@/../messages/fr.json";
import en from "@/../messages/en.json";
import de from "@/../messages/de.json";
import {
  getProductMedia,
  productMedia,
} from "@/features/product/data/product-media";

describe("real LUMIZA product media", () => {
  it("maps each finish to its supplied photograph", () => {
    expect(
      productMedia
        .filter((item) => item.kind === "product")
        .map(({ color, src, temporary }) => ({ color, src, temporary })),
    ).toEqual([
      {
        color: "black",
        src: "/images/product/lumiza-black.webp",
        temporary: false,
      },
      {
        color: "gold",
        src: "/images/product/lumiza-gold.webp",
        temporary: false,
      },
      {
        color: "silver",
        src: "/images/product/lumiza-silver.webp",
        temporary: false,
      },
    ]);
  });

  it("has six independent lifestyle images and localized card copy", () => {
    const ids = [
      "home",
      "restaurant",
      "hospitality",
      "terrace",
      "gift",
      "finishes",
    ];
    expect(
      productMedia
        .filter((item) => item.kind === "lifestyle")
        .map((item) => item.id),
    ).toEqual(ids);
    for (const messages of [fr, en, de]) {
      for (const id of ids) {
        expect(
          messages.UseCases[id as keyof typeof messages.UseCases],
        ).toMatchObject({
          title: expect.any(String),
          description: expect.any(String),
        });
      }
    }
  });

  it("keeps image paths valid and alt text localized", () => {
    for (const media of productMedia) {
      expect(existsSync(join(process.cwd(), "public", media.src))).toBe(true);
      expect(media.width).toBeGreaterThan(0);
      expect(media.height).toBeGreaterThan(0);
    }
    for (const locale of ["fr", "en", "de"] as const) {
      expect(
        getProductMedia(locale).every((media) => media.alt.length > 10),
      ).toBe(true);
    }
  });
});
