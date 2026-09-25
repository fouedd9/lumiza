export const ORDER_STATES = {
  creating: "creating_session",
  uncertain: "session_unknown",
  pending: "pending_payment",
  processing: "payment_processing",
  paid: "paid",
  failed: "failed",
  expired: "expired",
} as const;

export type OrderStatus = (typeof ORDER_STATES)[keyof typeof ORDER_STATES];

export function publicPaymentState(
  status: OrderStatus,
): "pending" | "paid" | "failed" {
  if (status === ORDER_STATES.paid) return "paid";
  if (status === ORDER_STATES.failed || status === ORDER_STATES.expired)
    return "failed";
  return "pending";
}
