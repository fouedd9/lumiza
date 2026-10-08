# LUMIZA Implemented Business Rules

Source inspection: 8 October 2026, branch `Harness-engineer`.
**Confirmed** below means implemented in local TypeScript/SQL, not demonstrated
on a remote database. Tests are evidence of intended contracts, not reported passes.
See `AGENTS.md` for approval requirements and `docs/architecture.md` for system flow.
Business-invariant changes require prior human approval.

## 1. Product, finishes and pack composition

**Confirmed**

| Pack ID | Label | Lamps per pack | Initial catalog price (EUR cents) |
| ------- | ----- | -------------- | --------------------------------- |
| `solo`  | SOLO  | 1              | 3499                              |
| `duo`   | DUO   | 2              | 5999                              |
| `pro`   | PRO   | 10             | 24999                             |

- Single product SKU `LUMIZA-LED-01`; finishes `black`, `gold`, `silver`.
- Each composition has nonnegative integer finish counts totaling its pack size.
  Example: DUO 1 black + 1 gold; PRO 5 gold + 3 silver + 2 black.
- TypeScript normalizes omitted finish counts to zero and rejects unknown keys.
  SQL normalizes stored compositions and enforces pack-size equality.
- Quantity means packs, not lamps: finish demand is composition count × quantity.
- Checkout accepts 1–10 lines, 1–10 packs per line and 1–30 lamps in total.
- Duplicate pack/composition lines are rejected by validation; cart addition merges
  identical selections and validates the resulting quantity.
- Product, packs and nonzero selected finishes must be active in the database.
- Display catalog reads active entries, but does not query inventory quantities.
  An offered finish is therefore not a guarantee of reservable stock.

**Authority:** `src/features/product/data/product.ts`,
`src/features/product/schemas/product.schema.ts`,
`src/features/product/data/purchase-catalog.server.ts`,
`src/features/commerce/schemas/cart.ts`,
`src/features/commerce/domain/cart-display.ts`,
`supabase/production/001_fresh_commerce.sql` (`commerce_reserve_checkout`),
`tests/product.test.ts`, `tests/commerce-domain.test.ts`, `tests/cart-display.test.ts`.

## 2. Prices and sources of truth

**Confirmed**

- Monetary calculations use integer EUR cents.
- Local product data defines initial prices, identifiers, labels and pack sizes.
  The display catalog reads current active EUR prices from Supabase.
- `commerce_reserve_checkout` computes totals from database packs and writes
  `order_items` price/quantity/composition snapshots.
- The checkout derives its quote from those snapshots, checks the local pack-size
  definition, then verifies all lines, finish allocations, subtotal, shipping,
  total and country before creating Stripe. It does not require a snapshot price
  to equal the initial price in `product.ts`.
- Line subtotal = pack price × number of packs; order subtotal = sum of lines.
  Current checkout total = subtotal + one shipping charge.
- Browser amounts are not trusted; extra top-level amount fields are stripped
  by request parsing. Strict cart-line parsing rejects additional line fields.
- Existing orders retain snapshot prices even if the current catalog changes.
- `tax_cents` is nullable; reservation leaves it unset. Stripe automatic tax is
  not enabled. This does not establish whether prices legally include VAT.

**Authority:** `src/features/commerce/domain/pricing.ts`,
`src/features/commerce/domain/catalog-guard.ts`,
`src/features/commerce/services/checkout.ts`,
`supabase/production/001_fresh_commerce.sql`,
`tests/commerce-domain.test.ts`, `tests/checkout-service.test.ts`.

**Limitation:** fiscal decisions remain unresolved in `src/config/business.ts`.
Current database prices and any remote Stripe tax settings are unverified.

## 3. Delivery countries and shipping

**Confirmed:** only FR, BE, DE and CH are enabled. Shipping is charged once per
order: FR 0 cents; BE/DE/CH 1000 cents. Locale does not determine delivery country.
The selected country is recorded on the order and Stripe metadata; Stripe accepts
an address only in that country. A different collected country is rejected during
payment processing; if the address country is absent, metadata is still used.

TypeScript and SQL both implement this rule. Their totals must agree before
charging. No carrier integration or dynamic shipping-rate table is implemented.
`src/config/business.ts` supplies a 3–5-business-day estimate and a 14-day withdrawal
policy, customer-paid withdrawal return shipping and original-payment refunds
unless expressly agreed. These are content settings, not automated fulfillment
or refund workflows. Swiss customs/import and VAT policies remain `null`.

**Authority:** `src/features/commerce/domain/shipping.ts`,
`src/features/commerce/services/checkout.ts`,
`src/features/commerce/services/payment-events.ts`, `src/config/business.ts`,
`supabase/migrations/202609230001_european_shipping.sql`,
`supabase/migrations/202609240002_mixed_finish_packs.sql`,
`supabase/production/001_fresh_commerce.sql`,
`tests/payment-events-country.test.ts`, `tests/shipping-migration.test.ts`.

## 4. Inventory and atomic reservations

**Confirmed**

- `inventory` stores aggregate physical quantity (`available_quantity`) and holds
  (`reserved_quantity`); `variant_inventory` stores the equivalent per finish.
- Reservable units = `available_quantity - reserved_quantity` at both levels.
  Constraints prohibit negative quantities and holds exceeding physical stock.
- The reservation RPC locks global inventory first, rechecks attempt deduplication,
  validates selections and locks finish inventory before checking demand.
- Order, snapshots, reservation, finish allocations and reserved counters are
  written in one transaction. Errors roll back that transaction.
- `inventory_reservations` states: `held`, `committed`, `released`.
  `reservation_allocations` records the finish quantities belonging to a hold.
- A paid commit decreases both physical and reserved quantities, globally and by
  finish. A release decreases reserved quantities only. Allocation totals are
  checked before changing held stock.
- Replayed paid events do not consume stock twice. Paid-after-release raises an
  error; the implementation does not silently allocate replacement stock.

**Authority:** `supabase/migrations/202609240002_mixed_finish_packs.sql`,
`supabase/production/001_fresh_commerce.sql` (reservation, failure, event RPCs),
`src/features/commerce/repositories/commerce-repository.ts`,
`tests/production-bootstrap.test.ts`, `tests/checkout-service.test.ts`.

**Limitation:** these tests do not prove concurrency/rollback behavior by executing
PostgreSQL. Actual stock, reservations and installed SQL require remote verification.

## 5. Session creation, expiry and safe release

**Confirmed**

- Each checkout carries an attempt UUID. SQL reuses the order only when country,
  locale and selection signature match; otherwise it rejects an attempt conflict.
- New checkout proposes session expiry at now + 31 minutes. SQL accepts new expiry
  between 30 minutes and 24 hours; hold expiry is session expiry + 5 minutes.
  Attaching a session updates the stored expiry and held reservation expiry.
- Stripe session uses `ui_mode: embedded_page`, `mode: payment`, EUR, card only,
  phone collection, selected-country shipping and a tokenized confirmation URL.
- Creation uses `lumiza-checkout-${checkout_attempt_id}` as the stable idempotency
  key; retries preserve the attempt. Valid attached pending/processing sessions
  reuse their client secret.
- Invalid request/authentication/permission creation failures call the failure RPC,
  which releases only unattached creating/unknown orders. Network/ambiguous creation
  or attachment outcomes retain the hold and mark creation unknown where applicable.
- An expired attached session is retrieved/expired and reconciled before the server
  reports the old attempt terminal. The client creates a new attempt only after
  the server returns `expired`.
- The browser caches ready sessions for less than 29 minutes. Attempt ID and locale
  persist in tab session storage; the server still verifies all business data.
- Time passing or leaving the browser does not itself run a stock-release operation.
  Expiry requires a verified terminal Stripe state through webhook/reconciliation.

**Authority:** `src/features/commerce/services/checkout.ts`,
`src/features/commerce/stripe/client.ts`,
`src/features/commerce/components/checkout-client.tsx`,
`supabase/production/001_fresh_commerce.sql` (`commerce_attach_session`,
`commerce_mark_session_unknown`, `commerce_fail_session`),
`tests/checkout-service.test.ts`, `tests/checkout-client.test.tsx`.

**Limitation:** prolonged unknown sessions can outlive Stripe idempotency retention.
No automatic safe recovery beyond that retention is established in the code;
manual investigation is needed. Reconciliation scheduling is not verified.

## 6. Webhooks and order states

**Confirmed:** the webhook verifies the untouched body using `stripe-signature`
and the configured secret. Relevant events are `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, and `payment_intent.payment_failed`.
Other same-mode events are ignored. A failed payment intent is associated with
its Checkout Session and its current state is fetched, rather than assuming failure
is terminal. Session events are also re-fetched to handle delivery disorder.

Mode checks cover event `livemode`, session `livemode` and session ID prefix.
Session processing requires EUR/payment mode, a total and status, and consistent
selected/collected countries. SQL matches session ID, amount and country to the
stored order. Event ID deduplication and inventory changes share one transaction.

| Order state          | Implemented meaning / transition                                                   |
| -------------------- | ---------------------------------------------------------------------------------- |
| `creating_session`   | Reservation exists, session creation not yet attached                              |
| `session_unknown`    | Creation outcome unknown and session not attached                                  |
| `pending_payment`    | Session attached from creating/unknown state                                       |
| `payment_processing` | Completed session without confirmed paid state, for completed/reconcile processing |
| `paid`               | Complete + paid, on completed/async-success/reconcile; hold committed              |
| `expired`            | Expired + unpaid, on expiry event or reconciliation; hold released                 |
| `failed`             | Definitive unattached creation failure, or unpaid async failure; hold released     |

An already-paid order is preserved against later non-paid events. Processing
errors produce webhook 503 so Stripe can retry. After a complete paid session,
email enqueue and Telegram errors are isolated; phone capture errors propagate
after the payment RPC has committed and can trigger replay.

**Authority:** `src/app/api/stripe/webhook/route.ts`,
`src/features/commerce/services/payment-events.ts`,
`src/features/commerce/domain/states.ts`, `src/features/commerce/stripe/mode.ts`,
`supabase/production/001_fresh_commerce.sql` (`commerce_process_event`),
`tests/stripe-webhook.test.ts`, `tests/stripe-mode.test.ts`,
`tests/payment-events-country.test.ts`.

**Remote verification:** registered webhook URL/events, secret/environment matching,
delivery retries and installed function bodies. None were checked for this mission.

## 7. Confirmation, cancellation and reconciliation

**Confirmed**

- Confirmation requires a valid UUID token and an attached session. Optional
  `session_id`, stored session, mode, total, currency and order metadata must match.
- Confirmation never mutates payment state. Database in-flight states map to pending;
  failed/expired map to failed. Paid/failed contradictions with Stripe map to pending.
- Reference, totals and item snapshots are returned only for paid confirmation;
  customer contact details are not exposed. Invalid checks return no reference.
- Cancellation requires matching origin and UUID token, retrieves the matching
  Stripe session, expires it if open (or re-fetches on failure), then reconciles.
  Response `canceled` requires expired + unpaid; otherwise it reports pending.
- Reconciliation requires `Authorization: Bearer ...` with `CRON_SECRET`, compared
  using `timingSafeEqual`; query-string secrets are not accepted.
- It processes at most 50 oldest creating/unknown/pending/processing orders per call.
  Unattached attempts retry checkout with the same ID; attached sessions are
  retrieved and expired if overdue/open, then processed through the event service.
- Reconciliation also dispatches email/Telegram jobs. Counted processing/email
  failures yield 503; Telegram failures do not fail the commerce response.

**Authority:** `src/features/commerce/services/confirmation.ts`,
`src/app/[locale]/order/confirmation/page.tsx`,
`src/app/api/checkout/cancel/route.ts`, `src/app/api/internal/reconcile/route.ts`,
`src/features/commerce/repositories/commerce-repository.ts`,
`tests/confirmation.test.ts`, `tests/reconcile-auth.test.ts`.

**Limitations:** no versioned cron schedule or dedicated cancellation-route test
was found. Persistent oldest failures may consume the bounded reconciliation batch.
The UUID token has no explicit TTL in the inspected schema.

## 8. Notifications, phone and data protection

**Confirmed**

- Phone capture only fills a missing phone on a paid order matching a verified
  session; replay does not overwrite it.
- Email outbox is unique per order; enabled dispatch would backfill paid orders
  with email, claim jobs with a 10-minute lease and at most five attempts, and use
  a stable provider idempotency key. The adapter is disabled: no delivery occurs.
- Telegram trigger enqueues only a transition from non-paid to paid, with one job
  per order and isolated enqueue errors. Claim requires a paid order; at most three
  attempts. Explicit API rejection is retryable; timeout/ambiguous server outcome
  is uncertain. Sending/uncertain jobs are not automatically reclaimed.
- Privileged access is server-only. SQL enables RLS, revokes public table access
  and RPC execution, and grants the intended service-role access. There are no
  customer-facing commerce RLS policies or login/admin flows in the inspected code.
- Session creation checks origin and body size (8192 threshold), then Zod inputs;
  cancellation checks origin/token and a 512-character body threshold. The webhook
  checks signature and a 1,000,000-character payload threshold after reading it.
- Confirmation/checkout use private no-store and noindex protections. Full CSP is
  report-only; only framing/object/base directives are enforced.
- Consent defaults optional categories off; analytics/marketing integrations obey
  their consent checks. Actual URL/token leakage requires browser network review.

**Authority:** `supabase/migrations/202610040001_customer_phone.sql`,
`supabase/migrations/202609290001_paid_telegram_outbox.sql`,
`supabase/migrations/202609240001_confirmation_email_outbox.sql`,
`src/features/email/provider.server.ts`,
`src/features/email/confirmation-email.server.ts`,
`src/features/telegram/paid-order-notification.server.ts`,
`src/config/commerce-env.server.ts`, `src/config/security-headers.ts`,
`src/features/consent/consent.ts`, `next.config.ts`,
`tests/customer-phone.test.ts`, `tests/telegram-migration.test.ts`,
`tests/telegram-notification.test.ts`, `tests/confirmation-email.test.ts`,
`tests/step4-security.test.ts`.

**Limitations:** no durable abuse limiter, automated refund/litigation workflow,
approved retention policy or complete merchant/tax/customs configuration is visible.
The missing-values helper is informational, not a hard checkout launch gate.

## 9. SQL history, discrepancies and remote checklist

| SQL path                                                              | Locally confirmed role                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/202609220001_step3_commerce.sql`                 | Original catalog, FR/DE, global TEST baseline of 30 and commerce functions                                          |
| `supabase/migrations/202609230001_european_shipping.sql`              | Extends shipping to FR/BE/DE/CH                                                                                     |
| `supabase/migrations/202609240001_confirmation_email_outbox.sql`      | Email outbox, jobs and access restrictions                                                                          |
| `supabase/migrations/202609240002_mixed_finish_packs.sql`             | Mixed composition, finish allocations and final stock/event RPCs; TEST-only reset to 150 global / 50 per finish     |
| `supabase/migrations/202609290001_paid_telegram_outbox.sql`           | Telegram outbox, paid-transition trigger and worker RPCs                                                            |
| `supabase/migrations/202610040001_customer_phone.sql`                 | Nullable phone and capture RPC                                                                                      |
| `supabase/production/001_fresh_commerce.sql`                          | Fresh-only transaction; zero inventory/history; currently missing Telegram and phone objects                        |
| `supabase/production/002_owner_inventory_initialization.template.sql` | Manual owner-count template; unchanged NULL values abort; existing transactions/nonzero stock refuse initialization |
| `supabase/production/verify_fresh_commerce.sql`                       | Read-only checks currently covering 11 tables/9 RPCs, not the newer objects                                         |

Never interpret historical TEST baselines as actual stock or a production reset
procedure. This mission neither applies SQL nor corrects these paths.
`tests/production-bootstrap.test.ts` checks a fixed nine-RPC list and does not
discover every current repository call. Applying the bootstrap alone cannot meet
the current phone/Telegram contract; missing phone RPC can repeatedly fail a
webhook after payment commit.

`README.md` still claims TEST-only checkout, FR/DE-only shipping, global-only
stock and comparison to initial local prices. `docs/production-database.md`
describes four migrations and a complete final schema. `docs/production-readiness.md`
claims no analytics scripts. Those claims conflict with current sources; existing
documents remain untouched.

**Requires separate authorized remote verification:** applied migrations/function
bodies, RLS/grants/triggers, owner-confirmed stock and active catalog prices,
Stripe mode/webhook configuration, reconciliation schedule and alerts, Telegram
destination/access, analytics collection and data retention, Vercel environment
settings and GitHub protections. None of these are certified by local files.
