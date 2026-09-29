import type { quoteCart } from "./pricing";
import type { ProductPack } from "@/features/product/types/product";
import { compositionKey, type Composition } from "../schemas/cart";

type Snapshot = {
  quantity: number;
  unit_quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  packs: { code: string };
  composition: Composition;
};

// The reservation RPC writes current catalog prices into immutable order-item snapshots.
// These snapshots, not launch defaults or browser values, price the Stripe session.
export function packsFromSnapshots(
  snapshots: Snapshot[],
  definitions: readonly ProductPack[],
): ProductPack[] {
  return snapshots.map((snapshot) => {
    const definition = definitions.find(
      (pack) => pack.id === snapshot.packs.code,
    );
    if (
      !definition ||
      snapshot.unit_quantity !== definition.quantity ||
      !Number.isSafeInteger(snapshot.unit_price_cents) ||
      snapshot.unit_price_cents < 0
    ) {
      throw new Error("Invalid order item snapshot");
    }
    return { ...definition, priceInCents: snapshot.unit_price_cents };
  });
}

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
