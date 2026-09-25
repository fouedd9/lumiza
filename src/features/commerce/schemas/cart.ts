import { z } from "zod";

import { ENABLED_COUNTRIES } from "../domain/shipping";

export const FINISHES = ["black", "gold", "silver"] as const;
export type Finish = (typeof FINISHES)[number];
export type Composition = Record<Finish, number>;

export function solidComposition(
  finish: Finish,
  packSize: number,
): Composition {
  return {
    black: finish === "black" ? packSize : 0,
    gold: finish === "gold" ? packSize : 0,
    silver: finish === "silver" ? packSize : 0,
  };
}

const packSizes = { solo: 1, duo: 2, pro: 10 } as const;
const count = z.number().int().min(0);

export const compositionSchema = z
  .object({
    black: count.default(0),
    gold: count.default(0),
    silver: count.default(0),
  })
  .strict();

export function compositionKey(composition: Composition) {
  return FINISHES.map((finish) => composition[finish]).join(":");
}

export function cartLineKey(item: {
  packId: string;
  composition: Composition;
}) {
  return `${item.packId}:${compositionKey(item.composition)}`;
}

export const cartItemSchema = z
  .object({
    packId: z.enum(["solo", "duo", "pro"]),
    composition: compositionSchema,
    quantity: z.number().int().min(1).max(10),
  })
  .strict()
  .superRefine((item, context) => {
    const total = FINISHES.reduce(
      (sum, finish) => sum + item.composition[finish],
      0,
    );
    if (total !== packSizes[item.packId]) {
      context.addIssue({ code: "custom", message: "Invalid pack composition" });
    }
  });

export const cartSchema = z
  .array(cartItemSchema)
  .max(10)
  .superRefine((items, context) => {
    const keys = new Set<string>();
    for (const item of items) {
      const key = cartLineKey(item);
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate cart selection",
        });
        return;
      }
      keys.add(key);
    }
  });

export const checkoutRequestSchema = z.object({
  attemptId: z.uuid(),
  country: z.enum(ENABLED_COUNTRIES),
  items: cartSchema.min(1),
});

export type CartItem = z.infer<typeof cartItemSchema>;
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
