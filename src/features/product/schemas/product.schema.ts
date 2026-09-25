import { z } from "zod";

const localizedTextSchema = z.object({
  fr: z.string().min(1),
  en: z.string().min(1),
  de: z.string().min(1),
});

export const productColorSchema = z.enum(["black", "gold", "silver"]);

export const productPackSchema = z.object({
  id: z.enum(["solo", "duo", "pro"]),
  label: z.enum(["SOLO", "DUO", "PRO"]),
  quantity: z.number().int().positive(),
  priceInCents: z.number().int().nonnegative(),
  currency: z.literal("EUR"),
});

export const productSchema = z.object({
  sku: z.literal("LUMIZA-LED-01"),
  name: localizedTextSchema,
  description: localizedTextSchema,
  colors: z.array(productColorSchema).min(1),
  specifications: z.object({
    powerWatts: z.literal(6),
    touchControl: z.literal(true),
    usbRechargeable: z.literal(true),
    colorTemperatureKelvin: z.literal(3500),
  }),
  packs: z.array(productPackSchema).length(3),
});
