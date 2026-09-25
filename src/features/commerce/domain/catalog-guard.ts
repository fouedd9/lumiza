import type { quoteCart } from "./pricing";
import { compositionKey, type Composition } from "../schemas/cart";

type Snapshot = {
  quantity: number;
  unit_quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  packs: { code: string };
  composition: Composition;
};

export function snapshotsMatchQuote(
  snapshots: Snapshot[],
  quote: ReturnType<typeof quoteCart>,
) {
  return (
    snapshots.length === quote.lines.length &&
    quote.lines.every((line) =>
      snapshots.some(
        (snapshot) =>
          snapshot.packs.code === line.packId &&
          compositionKey(snapshot.composition) ===
            compositionKey(line.composition) &&
          snapshot.quantity === line.quantity &&
          snapshot.unit_quantity === line.unitQuantity &&
          snapshot.unit_price_cents === line.unitPriceCents &&
          snapshot.total_price_cents === line.totalPriceCents,
      ),
    )
  );
}
