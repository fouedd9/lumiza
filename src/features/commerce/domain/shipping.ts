// The single authoritative launch shipping zone.
export const ENABLED_COUNTRIES = ["FR", "BE", "DE", "CH"] as const;
export type ShippingCountry = (typeof ENABLED_COUNTRIES)[number];

export function isShippingCountry(value: unknown): value is ShippingCountry {
  return (
    typeof value === "string" &&
    ENABLED_COUNTRIES.some((country) => country === value)
  );
}

export function shippingCents(country: ShippingCountry): number {
  if (!isShippingCountry(country)) throw new Error("Unsupported country");
  return country === "FR" ? 0 : 1000;
}
