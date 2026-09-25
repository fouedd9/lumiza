import type { z } from "zod";

import type {
  productColorSchema,
  productPackSchema,
  productSchema,
} from "../schemas/product.schema";

export type Product = z.infer<typeof productSchema>;
export type ProductPack = z.infer<typeof productPackSchema>;
export type ProductColor = z.infer<typeof productColorSchema>;
