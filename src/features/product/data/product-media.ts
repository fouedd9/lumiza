import type { AppLocale } from "@/i18n/routing";

import type { ProductColor } from "../types/product";

type LocalizedText = Record<AppLocale, string>;

export type ProductMedia = {
  id: string;
  src: string;
  width: number;
  height: number;
  alt: LocalizedText;
  kind: "product" | "lifestyle";
  color?: ProductColor;
  /** Generated lifestyle scenes need final visual approval; product photos are owner-supplied. */
  temporary: boolean;
};

export type ResolvedProductMedia = Omit<ProductMedia, "alt"> & { alt: string };

// All customer-facing image paths live here. Product photos are the supplied
// originals converted to WebP; lifestyle images are AI-assisted composites
// referencing those photos and should be reviewed before production release.
export const productMedia = [
  {
    id: "black",
    src: "/images/product/lumiza-black.webp",
    width: 800,
    height: 800,
    kind: "product",
    color: "black",
    temporary: false,
    alt: {
      fr: "Lampe LUMIZA noire allumée, vue de face",
      en: "Black LUMIZA lamp illuminated, front view",
      de: "Schwarze LUMIZA Leuchte eingeschaltet, Vorderansicht",
    },
  },
  {
    id: "gold",
    src: "/images/product/lumiza-gold.webp",
    width: 800,
    height: 800,
    kind: "product",
    color: "gold",
    temporary: false,
    alt: {
      fr: "Lampe LUMIZA dorée allumée, vue de face",
      en: "Gold LUMIZA lamp illuminated, front view",
      de: "Goldene LUMIZA Leuchte eingeschaltet, Vorderansicht",
    },
  },
  {
    id: "silver",
    src: "/images/product/lumiza-silver.webp",
    width: 800,
    height: 800,
    kind: "product",
    color: "silver",
    temporary: false,
    alt: {
      fr: "Lampe LUMIZA argentée allumée, vue de face",
      en: "Silver LUMIZA lamp illuminated, front view",
      de: "Silberne LUMIZA Leuchte eingeschaltet, Vorderansicht",
    },
  },
  {
    id: "home",
    src: "/images/lifestyle/lumiza-home.webp",
    width: 1200,
    height: 900,
    kind: "lifestyle",
    temporary: true,
    alt: {
      fr: "Lampe LUMIZA dorée sur une table près d’un canapé",
      en: "Gold LUMIZA lamp on a table beside a sofa",
      de: "Goldene LUMIZA Leuchte auf einem Tisch neben einem Sofa",
    },
  },
  {
    id: "restaurant",
    src: "/images/lifestyle/lumiza-restaurant.webp",
    width: 1200,
    height: 900,
    kind: "lifestyle",
    temporary: true,
    alt: {
      fr: "Lampe LUMIZA dorée sur une table de restaurant",
      en: "Gold LUMIZA lamp on a restaurant table",
      de: "Goldene LUMIZA Leuchte auf einem Restauranttisch",
    },
  },
  {
    id: "hospitality",
    src: "/images/lifestyle/lumiza-hotel.webp",
    width: 1200,
    height: 900,
    kind: "lifestyle",
    temporary: true,
    alt: {
      fr: "Lampe LUMIZA argentée sur une table de chevet d’hôtel",
      en: "Silver LUMIZA lamp on a hotel bedside table",
      de: "Silberne LUMIZA Leuchte auf einem Nachttisch im Hotel",
    },
  },
  {
    id: "terrace",
    src: "/images/lifestyle/lumiza-terrace.webp",
    width: 1200,
    height: 900,
    kind: "lifestyle",
    temporary: true,
    alt: {
      fr: "Lampe LUMIZA noire sur une table de terrasse au coucher du soleil",
      en: "Black LUMIZA lamp on a terrace table at sunset",
      de: "Schwarze LUMIZA Leuchte auf einem Terrassentisch bei Sonnenuntergang",
    },
  },
  {
    id: "gift",
    src: "/images/lifestyle/lumiza-gift-christmas.webp",
    width: 1200,
    height: 900,
    kind: "lifestyle",
    temporary: true,
    alt: {
      fr: "Lampe LUMIZA dorée près de cadeaux de Noël",
      en: "Gold LUMIZA lamp beside Christmas gifts",
      de: "Goldene LUMIZA Leuchte neben Weihnachtsgeschenken",
    },
  },
  {
    id: "finishes",
    src: "/images/lifestyle/lumiza-finishes.webp",
    width: 1200,
    height: 900,
    kind: "lifestyle",
    temporary: true,
    alt: {
      fr: "Lampes LUMIZA dorée, argentée et noire côte à côte",
      en: "Gold, silver and black LUMIZA lamps side by side",
      de: "Goldene, silberne und schwarze LUMIZA Leuchten nebeneinander",
    },
  },
] as const satisfies readonly ProductMedia[];

export function getProductMedia(locale: AppLocale): ResolvedProductMedia[] {
  return productMedia.map((media) => ({
    ...media,
    alt: media.alt[locale],
  }));
}
