# Separate Supabase production database — local preparation only

The existing Supabase project and the four dated files in `supabase/migrations/`
belong to TEST. Production must be a **separate, fresh Supabase project**. Do
not clone TEST, replay its order history, copy its inventory, or run the
historical TEST migration chain in production. No production project or remote
database has been created or modified by this preparation.

## Migration audit, in order

| TEST file                                    | Creates or changes                                                                                                                                                                                                        | Why it is not the fresh-production path                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `202609220001_step3_commerce.sql`            | Base product/catalog, global inventory, orders/items/reservations/payment events, RLS and service-only RPCs. Seeds SOLO/DUO/PRO and 30 global lamps.                                                                      | Initial RPC accepts single-color items, FR/DE only, and assumes 30 TEST lamps.                                                                                        |
| `202609230001_european_shipping.sql`         | Extends country constraint and replaces reservation RPC for FR/BE/DE/CH, charging €0 FR and €10 elsewhere.                                                                                                                | Still uses the obsolete single-color cart and global-only inventory.                                                                                                  |
| `202609240001_confirmation_email_outbox.sql` | Adds unique-per-order outbox, RLS, enqueue/backfill/claim/finish RPCs and grants.                                                                                                                                         | Final outbox design is retained, but no historical paid-order backfill is needed on a fresh database.                                                                 |
| `202609240002_mixed_finish_packs.sql`        | TEST-only safety checks, legacy order-item composition and reservation-allocation backfills, releases eligible old holds, resets physical stock to 150 and 50 per finish, then replaces reservation/failure/payment RPCs. | It explicitly refuses non-TEST Stripe sessions and rewrites inventory from a TEST baseline. Removing its guard would not make its reset/backfill safe for production. |

The fresh bootstrap is [001_fresh_commerce.sql](../supabase/production/001_fresh_commerce.sql).
It is a single transaction with a guard against existing commerce objects.
It creates final tables and constraints directly, seeds only non-transactional
catalog data, installs the **final** mixed-finish reservation/failure/payment
RPC bodies plus unchanged session and email RPCs, grants only server access,
asserts empty history and zero stock, then commits. It does not replay obsolete
RPC versions or backfill legacy rows. Do not add this file to the TEST migration
sequence.

## Final data contract

- Product `LUMIZA-LED-01`; active Black, Gold and Silver variants.
- Active EUR packs: SOLO 1 lamp/3499 cents, DUO 2/5999, PRO 10/24999.
- Supported shipping countries are exactly FR, BE, DE and CH. The final
  `commerce_reserve_checkout` RPC is the database shipping configuration: FR
  0 cents, BE/DE/CH 1000 cents. The TypeScript quote uses the same rules and
  rejects a database/quote mismatch before charging. There is no shipping-rate
  table or VAT/tax assumption in the current application.
- Each cart line has a Black/Gold/Silver composition, validated in the RPC to
  equal the pack size. The `order_items_composition_valid` constraint stores
  exactly three nonnegative integer finish counts. A DUO 1 Black + 1 Gold and
  PRO 5 Gold + 3 Silver + 2 Black are accepted compositions.
- Global inventory and per-finish inventory each start at **zero physical and
  zero reserved**. There are zero orders, order items, reservations,
  allocations, payment events and email jobs. This prevents sales before the
  owner-approved stock is entered.
- Reservations, releases and commits use the validated global-inventory-first
  lock order and per-finish allocation records. A failed transaction rolls back
  its reservation/event changes. The order attempt ID, Stripe event ID and
  unique outbox order ID provide their respective idempotency boundaries.
- All 11 commerce tables have RLS. `anon` and `authenticated` have no direct
  table privileges or commerce RPC execution. `service_role` has SELECT and
  execution of the nine required RPCs. Only server-side code holds that key.

## Future manual setup — not performed by this task

1. The owner creates a **new** Supabase production project, separate from TEST,
   and records its production URL, publishable key and service-role key in a
   secure secret manager. Do not paste credentials into SQL, documents or chat.
2. Confirm the project is fresh and has no LUMIZA commerce objects or sales.
   Stop if it contains existing business data. Manually apply only
   `supabase/production/001_fresh_commerce.sql` as one execution/transaction.
   Do **not** apply the four TEST files. If it fails, investigate rather than
   bypassing its guard or deleting production data.
3. Run [verify_fresh_commerce.sql](../supabase/production/verify_fresh_commerce.sql)
   against that production project. Check all tables/RPCs, RLS, grants, catalog,
   shipping function, zero stock and zero transaction rows.
4. Have the owner confirm the physical on-hand Black, Gold and Silver counts.
   Enter those three explicit nonnegative numbers into a reviewed copy of
   [002_owner_inventory_initialization.template.sql](../supabase/production/002_owner_inventory_initialization.template.sql),
   replacing its three `NULL` values. Apply once, before the first sale. The
   unchanged template intentionally fails. It refuses any existing transaction
   or nonzero stock and updates the global total atomically from the finish
   counts; it does not consume any units.
5. Run the read-only verification again. Compare each finish to the signed
   owner count; check global stock equals their sum and reserved stock and
   transactional row counts remain zero. Obtain a second review/sign-off.
6. Only then configure Vercel's environment variables for the separate
   production Supabase URL/keys, `STRIPE_MODE=live` with matching keys,
   production HTTPS `NEXT_PUBLIC_SITE_URL`, webhook secret and `CRON_SECRET`.
   Configure and verify the production webhook and reconciliation schedule in
   their separately approved deployment tasks. Do not enable checkout until
   those dependencies and all other production-readiness blockers are cleared.

The read-only verification file deliberately does not contain owner quantities.
The reviewer must compare its per-finish output to the owner's approved record.
No claim of a remote or PostgreSQL execution test is made here.
