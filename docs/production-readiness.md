# LUMIZA production-readiness checklist (Step 4)

This is an engineering checklist, not legal advice. The localized legal pages are drafts and **must not be treated as approved sales terms**. Step 5 has not begun.

## Ready in the current TEST implementation

- FR/EN/DE navigation and the four-country checkout zone (FR, BE, DE, CH).
- Server-verified catalog, one per-order shipping charge, inventory reservation, signed Stripe TEST webhooks and private-token confirmation.
- Service-role-only commerce access in application code; RLS is enabled on commerce tables and RPC execution is revoked from `anon`/`authenticated` in the applied Step 3 migration.
- Optional consent defaults off; no analytics or marketing scripts are installed.
- Localized legal-page _architecture_ and footer navigation. The content is explicitly incomplete.
- Confirmed customer-contact WhatsApp number with localized pre-filled messages, and a 3–5-business-day estimated delivery time for FR/BE/DE/CH.

## Needs configuration and verification before production

- The three owner-supplied product photos are integrated; approve or replace the six AI-assisted lifestyle composites before production, and verify product specifications, finishes, certifications and claims.
- Provide every remaining `null` merchant value in `src/config/business.ts`: legal business name, business type, registration number, VAT number, registered address, legal contact email, phone (if offered), publication director, hosting provider/address and customer-service hours. The customer-service email, WhatsApp number and return address are configured from owner-supplied values.
- Review the configured 14-day consumer withdrawal, return-shipping, refund and 3–5-business-day delivery-estimate wording with qualified counsel before production. Decide the remaining `null` policies: defective-product handling details, dispute contact, privacy retention, Switzerland imports/customs and tax/VAT treatment. The €10 Swiss shipping price is **not** a customs or tax promise.
- Have qualified counsel review FR/EN/DE legal notice, privacy information, terms, withdrawal/returns and country-specific consumer-law disclosures. Replace draft copy with approved text.
- Configure a transactional email provider with an idempotency guarantee for the stable `idempotencyKey` provided by `EmailProvider.send`. The adapter is currently disabled and **no confirmation emails are delivered**. Verify FR/EN/DE emails and failure/retry behavior.
- The historical `supabase/migrations/202609240001_confirmation_email_outbox.sql` is for the existing TEST migration chain. The fresh production bootstrap already includes the final outbox schema and RPCs; do not replay that TEST file in production. No remote migration was applied by this task.
- Keep the existing TEST Supabase project separate from a fresh PRODUCTION project. The four dated migrations in `supabase/migrations/` are TEST history, not a production bootstrap. Follow [the production database preparation](production-database.md): apply the guarded final-schema bootstrap to a new project, verify zero history, initialize only owner-confirmed physical stock, then configure production variables. This task did not connect to either project.
- Once a provider is enabled, the authorized reconciliation job backfills paid orders into the unique-per-order outbox before claiming jobs; this also recovers a transient webhook enqueue failure. Run and monitor this job before expecting any email delivery.
- Configure production Supabase, production Stripe and a production webhook endpoint. The local code accepts explicitly configured TEST or LIVE commerce mode with matching keys, sessions and webhook events; no LIVE credentials or remote endpoint have been configured by this task. Verify the complete LIVE setup separately before launch.
- Configure a strong `CRON_SECRET` (prefix `cron_`, at least 37 characters), authorized schedule and monitoring of reconciliation failures. Never put this secret in `NEXT_PUBLIC_*` or a query string. No schedule is currently deployed.
- Deploy a durable, shared checkout/confirmation abuse-control mechanism (for example, edge or gateway rate limiting). The checkout currently has an origin check, an 8 KB body limit, strict cart validation and per-attempt idempotency, but these do not stop scripted requests with fresh attempt IDs from reserving stock and creating Stripe sessions. The origin header can be forged outside a browser. No in-memory limiter is presented as production protection; select and test shared infrastructure, including behavior for customers behind shared IPs, before launch.
- Move the report-only Stripe-aware CSP to a verified nonce-based enforced policy. The currently enforced `frame-ancestors`, `object-src` and `base-uri` directives do not block checkout. Verify Stripe frames, requests and any redirect flows in a real browser before enforcing the full policy.
- Review consent copy, cookie/storage inventory and any Step 5 analytics/marketing vendors before activating optional scripts. Optional scripts must query `optionalConsent()` and react to consent changes.
- Set a documented data-retention schedule and privacy-request procedure; validate operational log retention and Supabase backups.
- Complete production-like end-to-end tests (checkout, webhook, email, reconciliation, refund/return workflows, accessibility and responsive UI) without using live cards before an approved production rollout.

## Blocking production

- Missing verified merchant identity/contact/return address and approved legal/commercial policies.
- Unresolved Swiss customs/import/VAT responsibility and broader tax/VAT configuration.
- Unverified product facts/photos.
- No configured email sender, no durable rate limit, and no enforced full CSP review.
- No approved production Supabase/Stripe/webhook/reconciliation configuration.

The floating WhatsApp contact link uses the configured international-format number. It is hidden while the consent banner is unanswered, while product-gallery or Add to Cart controls are visible, and on checkout/confirmation pages so it cannot cover those controls.

## Environment classification

Public browser configuration: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`.

Server secrets: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, and any future transactional-email credential. `STRIPE_MODE` is a server-only non-secret and must be explicit in production. Never import secrets into a client module, render them in HTML, or log them.

The checkout cart in `localStorage` contains product selection only. `sessionStorage` contains checkout-attempt UUID and locale, not customer address or card data. Consent is versioned in local storage; invalid or older versions return to the optional-off state.

## RLS and customer-data audit

`products`, `product_variants`, `packs`, `inventory`, `orders`, `order_items`, `inventory_reservations` and `payment_events` have RLS enabled in Step 3. The Step 4 email outbox migration enables RLS and grants access only to `service_role`. Server code uses the service role only from `server-only` modules. No browser-side order lookup exists. Verify these grants again in each production project after migrations are applied.

## Manual TEST migration history

Apply [the Step 4 outbox migration](../supabase/migrations/202609240001_confirmation_email_outbox.sql) to Supabase TEST through the project's approved migration workflow. Do not assume a local file has changed the remote database.
