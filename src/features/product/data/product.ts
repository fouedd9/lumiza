import { productSchema } from "../schemas/product.schema";

export const lumizaProduct = productSchema.parse({
  sku: "LUMIZA-LED-01",
  name: {
    fr: "Lampe LED sans fil LUMIZA",
    en: "LUMIZA cordless LED lamp",
    de: "Kabellose LUMIZA LED-Leuchte",
  },
  description: {
    fr: "Lampe LED rechargeable, élégante et sans fil.",
    en: "An elegant, rechargeable cordless LED lamp.",
    de: "Eine elegante, wiederaufladbare LED-Leuchte ohne Kabel.",
  },
  colors: ["black", "gold", "silver"],
  specifications: {
    powerWatts: 6,
    touchControl: true,
    usbRechargeable: true,
    colorTemperatureKelvin: 3500,
  },
  packs: [
    {
      id: "solo",
      label: "SOLO",
      quantity: 1,
      priceInCents: 3499,
      currency: "EUR",
    },
    {
      id: "duo",
      label: "DUO",
      quantity: 2,
      priceInCents: 5999,
      currency: "EUR",
    },
    {
      id: "pro",
      label: "PRO",
      quantity: 10,
      priceInCents: 24999,
      currency: "EUR",
    },
  ],
});
