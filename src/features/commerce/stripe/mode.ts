export type StripeMode = "test" | "live";

export function stripeSessionMatchesMode(
  session: { id: string; livemode: boolean },
  mode: StripeMode,
) {
  return (
    session.livemode === (mode === "live") &&
    session.id.startsWith(`cs_${mode}_`)
  );
}

export function stripeSessionIdMatchesMode(id: string, mode: StripeMode) {
  return id.startsWith(`cs_${mode}_`);
}

export function stripeEventMatchesMode(
  event: { livemode: boolean },
  mode: StripeMode,
) {
  return event.livemode === (mode === "live");
}
