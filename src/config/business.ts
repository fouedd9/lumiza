/** Merchant facts are only populated when confirmed by the owner. */
export const business = {
  brandName: "LUMIZA",
  legalBusinessName: null,
  businessType: null,
  registrationNumber: null,
  vatNumber: null,
  registeredAddress: null,
  contactEmail: null,
  supportEmail: "fouedsaidane2@gmail.com",
  phone: null,
  whatsappNumber: "+33767653082",
  publicationDirector: null,
  hostingProvider: null,
  hostingAddress: null,
  returnsAddress: "53 boulevard Joliot-Curie\n38600 Fontaine\nFrance",
  customerServiceHours: null,
} as const satisfies Record<string, string | null>;

/** A null policy is not an implicit promise to a customer. */
export const commercePolicy = {
  withdrawal: { days: 14 },
  returns: {
    contactBeforeReturn: true,
    withdrawalReturnShippingPayer: "customer",
  },
  refunds: { method: "original_unless_expressly_agreed" },
  deliveryTimes: { minBusinessDays: 3, maxBusinessDays: 5 },
  defectiveProducts: null,
  disputeContact: null,
  privacyRetention: null,
  swissImportAndCustoms: null,
  taxAndVat: null,
} as const satisfies Record<string, string | object | null>;

export function missingProductionDecisions() {
  return [
    ...Object.entries(business)
      .filter(([, value]) => value === null)
      .map(([key]) => `business.${key}`),
    ...Object.entries(commercePolicy)
      .filter(([, value]) => value === null)
      .map(([key]) => `commercePolicy.${key}`),
  ];
}

/** A missing or malformed number never produces a customer-facing wa.me URL. */
export function whatsappHref(
  number: string | null = business.whatsappNumber,
  message?: string,
) {
  const normalized = number?.replace(/^\+/, "");
  return normalized && /^[1-9]\d{7,14}$/.test(normalized)
    ? `https://wa.me/${normalized}${message ? `?text=${encodeURIComponent(message)}` : ""}`
    : null;
}
