// The narrow enforced directives do not interfere with Next.js hydration or Stripe.
// The full Stripe-aware policy is report-only until nonce and browser verification are complete.
export const enforcedCsp =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

export const reportOnlyCsp = [
  "default-src 'self'",
  "script-src 'self' https://js.stripe.com",
  "style-src 'self'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://r.stripe.com https://*.stripe.com https://*.supabase.co",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function securityHeaders(productionHttps: boolean) {
  return [
    { key: "Content-Security-Policy", value: enforcedCsp },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    ...(productionHttps
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ]
      : []),
  ];
}
