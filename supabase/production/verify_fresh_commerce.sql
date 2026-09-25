-- READ-ONLY checks for the future, separate production project. Run after 001,
-- again after owner stock initialization, and before enabling checkout.
-- Review every result; this file does not mutate the database.

with expected(name) as (values
  ('products'),('product_variants'),('packs'),('inventory'),
  ('variant_inventory'),('orders'),('order_items'),
  ('inventory_reservations'),('reservation_allocations'),
  ('payment_events'),('confirmation_email_outbox')
)
select e.name, c.oid is not null as exists, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') as anon_mutation,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as authenticated_mutation,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_select
from expected e
left join pg_class c on c.oid = to_regclass('public.' || e.name)
order by e.name;
-- Expected: 11 present, RLS true, public permissions false, service SELECT true.

with expected(signature) as (values
  ('public.commerce_reserve_checkout(uuid,text,jsonb,timestamptz,text)'),
  ('public.commerce_attach_session(uuid,text,text,timestamptz)'),
  ('public.commerce_fail_session(uuid)'),
  ('public.commerce_mark_session_unknown(uuid)'),
  ('public.commerce_process_event(text,text,text,text,text,integer,text,text,text,text)'),
  ('public.commerce_enqueue_paid_email(text)'),
  ('public.commerce_backfill_paid_emails()'),
  ('public.commerce_claim_confirmation_email(uuid)'),
  ('public.commerce_finish_confirmation_email(uuid,uuid,boolean)')
)
select e.signature, p.oid is not null as exists,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from expected e
left join pg_proc p on p.oid = to_regprocedure(e.signature)
order by e.signature;
-- Expected: 9 present, SECURITY DEFINER true, public EXECUTE false, service true.

select p.sku, p.active, pv.color as finish, pv.active as finish_active,
  vi.available_quantity as owner_physical_quantity,
  vi.reserved_quantity as reserved_quantity
from public.products p
join public.product_variants pv on pv.product_id = p.id
join public.variant_inventory vi on vi.variant_id = pv.id
where p.sku = 'LUMIZA-LED-01'
order by pv.color;
-- Before owner initialization: 0/0 for all three finishes.
-- Afterward: compare each physical quantity with the owner's signed count.

select code, quantity as lamps_per_pack, price_cents, currency, active
from public.packs order by code;
-- Expected: SOLO 1/3499, DUO 2/5999, PRO 10/24999, all EUR/active.

select i.available_quantity as global_physical,
  i.reserved_quantity as global_reserved,
  (select sum(vi.available_quantity)::integer from public.variant_inventory vi
   join public.product_variants pv on pv.id = vi.variant_id
   where pv.product_id = i.product_id) as summed_finish_physical,
  (select sum(vi.reserved_quantity)::integer from public.variant_inventory vi
   join public.product_variants pv on pv.id = vi.variant_id
   where pv.product_id = i.product_id) as summed_finish_reserved
from public.inventory i join public.products p on p.id = i.product_id
where p.sku = 'LUMIZA-LED-01';
-- Expected: global equals finish sums; reserved remains zero before sales.

select 'orders' as object, count(*) as row_count from public.orders
union all select 'order_items', count(*) from public.order_items
union all select 'reservations', count(*) from public.inventory_reservations
union all select 'active_reservations', count(*) from public.inventory_reservations where status = 'held'
union all select 'allocations', count(*) from public.reservation_allocations
union all select 'payment_events', count(*) from public.payment_events
union all select 'email_jobs', count(*) from public.confirmation_email_outbox;
-- Expected: every count is zero before the first production checkout.

select pg_get_functiondef(
  to_regprocedure('public.commerce_reserve_checkout(uuid,text,jsonb,timestamptz,text)')
) as reviewed_shipping_and_composition_rules;
-- Review the authoritative RPC: only FR/BE/DE/CH; FR 0, others 1000 cents;
-- composition sums to the selected pack size and finish stock is checked.
