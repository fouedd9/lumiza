-- TEST ONLY. Run this entire file once, as one SQL Editor execution, after all
-- legacy Stripe TEST sessions have expired. Never run it against production.
-- The 50/50/50 stock is a NEW physical baseline after the old development tests;
-- historical paid orders and payment events remain as audit history, not as
-- deductions from this baseline. Stop customer checkout while applying it.
begin;
set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- Freeze every table involved in a legacy checkout or payment transition.
lock table public.products, public.product_variants, public.packs, public.inventory,
  public.inventory_reservations, public.orders, public.order_items,
  public.payment_events, public.confirmation_email_outbox in access exclusive mode;

do $$
declare
  v_product uuid;
  v_global public.inventory;
  v_held integer;
begin
  if to_regclass('public.variant_inventory') is not null
     or to_regclass('public.reservation_allocations') is not null
     or exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'order_items' and column_name = 'composition') then
    raise exception 'mixed-finish migration already started or applied';
  end if;
  select id into strict v_product from public.products where sku = 'LUMIZA-LED-01' and active;
  if (select count(*) from public.product_variants where product_id = v_product
      and color in ('black', 'gold', 'silver') and active) <> 3
     or (select count(*) from public.product_variants where product_id = v_product) <> 3 then
    raise exception 'expected exactly three active LUMIZA finishes';
  end if;
  if (select count(*) from public.packs where active and currency = 'EUR'
      and (code, quantity, price_cents) in
        (('solo', 1, 3499), ('duo', 2, 5999), ('pro', 10, 24999))) <> 3 then
    raise exception 'LUMIZA pack catalog differs from the application';
  end if;
  if exists (select 1 from public.order_items where product_id <> v_product)
     or exists (select 1 from public.inventory_reservations ir
       where not exists (select 1 from public.order_items oi
         where oi.order_id = ir.order_id and oi.product_id = v_product)) then
    raise exception 'unexpected non-LUMIZA or itemless transactional data';
  end if;
  if exists (select 1 from public.orders
      where stripe_checkout_session_id is not null
        and stripe_checkout_session_id not like 'cs_test_%') then
    raise exception 'non-TEST Stripe session found; refusing baseline reset';
  end if;
  select * into strict v_global from public.inventory where product_id = v_product;
  select coalesce(sum(quantity), 0)::integer into v_held
    from public.inventory_reservations where status = 'held';
  if v_global.reserved_quantity <> v_held then
    raise exception 'legacy held reservations do not match global reserved stock';
  end if;
  if exists (select 1 from public.payment_events where processing_status <> 'processed')
     or exists (select 1 from public.orders o
       where o.status in ('creating_session', 'session_unknown', 'pending_payment', 'payment_processing')
         and not exists (select 1 from public.inventory_reservations ir
           where ir.order_id = o.id and ir.status = 'held')) then
    raise exception 'unsettled legacy checkout or payment event requires reconciliation';
  end if;
  -- A Stripe session can still complete before its expiry. Never release such
  -- a session merely to make the new baseline look clean.
  if exists (
    select 1 from public.inventory_reservations ir
    join public.orders o on o.id = ir.order_id
    where ir.status = 'held'
      and (o.status <> 'pending_payment'
        or o.stripe_checkout_session_id is null
        or greatest(o.stripe_expires_at + interval '5 minutes', ir.expires_at) >= now())
  ) then
    raise exception 'legacy held checkout is not safely expired';
  end if;
  if exists (select 1 from public.inventory_reservations ir
    join public.orders o on o.id = ir.order_id
    where (ir.status = 'committed' and o.status <> 'paid')
       or (o.status = 'paid' and ir.status <> 'committed')) then
    raise exception 'historical paid order/reservation mismatch';
  end if;
end $$;

-- Keep all old order, item, reservation, payment-event and email-outbox rows.
-- Only terminalize expired, unpaid legacy holds; no old consumed unit is
-- deducted from the new owner-approved physical baseline.
update public.orders o set status = 'expired', updated_at = now()
where exists (select 1 from public.inventory_reservations ir
  where ir.order_id = o.id and ir.status = 'held');
update public.inventory_reservations set status = 'released', updated_at = now()
where status = 'held';
update public.inventory set available_quantity = 150, reserved_quantity = 0,
  updated_at = now()
where product_id = (select id from public.products where sku = 'LUMIZA-LED-01');

alter table public.order_items add column composition jsonb;

update public.order_items oi set composition = jsonb_build_object(
  'black', case when pv.color = 'black' then oi.unit_quantity else 0 end,
  'gold', case when pv.color = 'gold' then oi.unit_quantity else 0 end,
  'silver', case when pv.color = 'silver' then oi.unit_quantity else 0 end
)
from public.product_variants pv where oi.variant_id = pv.id;

alter table public.order_items alter column composition set not null;
-- Exactly three non-negative integer finish counts, adding up to the physical
-- lamp count PER PACK. Equality with a reconstructed object rejects extra keys,
-- quoted numbers, fractions and missing finishes even for privileged writers.
alter table public.order_items add constraint order_items_composition_valid
  check (
    composition = jsonb_build_object(
      'black', (composition->>'black')::integer,
      'gold', (composition->>'gold')::integer,
      'silver', (composition->>'silver')::integer
    )
    and (composition->>'black')::integer >= 0
    and (composition->>'gold')::integer >= 0
    and (composition->>'silver')::integer >= 0
    and (composition->>'black')::integer
      + (composition->>'gold')::integer
      + (composition->>'silver')::integer = unit_quantity
  );
create unique index order_items_pack_composition_idx
  on public.order_items(order_id, pack_id, composition);

create table public.variant_inventory (
  variant_id uuid primary key references public.product_variants(id),
  available_quantity integer not null check (available_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  updated_at timestamptz not null default now(),
  check (reserved_quantity <= available_quantity)
);

create table public.reservation_allocations (
  reservation_id uuid not null references public.inventory_reservations(id),
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  primary key (reservation_id, variant_id)
);
create index reservation_allocations_variant_idx
  on public.reservation_allocations(variant_id);

alter table public.variant_inventory enable row level security;
alter table public.reservation_allocations enable row level security;
revoke all on public.variant_inventory, public.reservation_allocations from public, anon, authenticated;
grant select on public.variant_inventory, public.reservation_allocations to service_role;

-- Historical single-finish orders are deterministic: pack size x that finish.
-- Preserve all historical order rows and backfill allocations for every reservation state.
insert into public.reservation_allocations(reservation_id, variant_id, quantity)
select ir.id, pv.id, sum(oi.quantity * (oi.composition->>pv.color)::integer)::integer
from public.inventory_reservations ir
join public.order_items oi on oi.order_id = ir.order_id
join public.product_variants pv on pv.product_id = oi.product_id
where (oi.composition->>pv.color)::integer > 0
group by ir.id, pv.id;

do $$
declare
  v_product uuid;
begin
  if exists (
    select 1 from public.inventory_reservations ir
    left join public.reservation_allocations ra on ra.reservation_id = ir.id
    group by ir.id, ir.quantity having coalesce(sum(ra.quantity), 0) <> ir.quantity
  ) then
    raise exception 'historical reservation allocation mismatch';
  end if;
  select id into strict v_product from public.products where sku = 'LUMIZA-LED-01';
  if exists (select 1 from public.inventory_reservations where status = 'held') then
    raise exception 'legacy reservation still held after reset';
  end if;
end $$;

-- Authoritative owner-approved TEST stock; old committed/released records are
-- historical only and deliberately do not reduce these quantities.
insert into public.variant_inventory(variant_id, available_quantity, reserved_quantity)
select pv.id, 50, 0 from public.product_variants pv
join public.products p on p.id = pv.product_id
where p.sku = 'LUMIZA-LED-01' and pv.color in ('black', 'gold', 'silver');

create or replace function public.commerce_reserve_checkout(
  p_attempt uuid, p_country text, p_items jsonb, p_expires_at timestamptz, p_locale text
) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders;
  v_inventory public.inventory;
  v_product public.products;
  v_item jsonb;
  v_composition jsonb;
  v_pack public.packs;
  v_variant public.product_variants;
  v_reservation public.inventory_reservations;
  v_finish text;
  v_value text;
  v_count integer;
  v_qty integer;
  v_size integer;
  v_lamps integer := 0;
  v_subtotal integer := 0;
  v_needed jsonb := '{"black":0,"gold":0,"silver":0}'::jsonb;
  v_key text;
  v_seen text[] := '{}';
begin
  if p_country is null or p_locale is null or p_country not in ('FR','BE','DE','CH') or p_locale not in ('fr','en','de')
     or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid_checkout' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'invalid_checkout' using errcode = '22023';
  end if;
  select * into v_order from public.orders where checkout_attempt_id = p_attempt;
  if found then
    if v_order.shipping_country <> p_country or v_order.checkout_locale <> p_locale
       or v_order.selection_signature <> p_items then raise exception 'attempt_conflict' using errcode = '22023'; end if;
    return v_order;
  end if;
  if p_expires_at < now() + interval '30 minutes' or p_expires_at > now() + interval '24 hours' then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;
  select * into strict v_product from public.products where sku = 'LUMIZA-LED-01' and active;
  -- Global lock serializes reservations, releases and commitments for this product.
  select * into strict v_inventory from public.inventory where product_id = v_product.id for update;
  select * into v_order from public.orders where checkout_attempt_id = p_attempt;
  if found then
    if v_order.shipping_country <> p_country or v_order.checkout_locale <> p_locale
       or v_order.selection_signature <> p_items then raise exception 'attempt_conflict' using errcode = '22023'; end if;
    return v_order;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(v_item)) <> 3
       or not (v_item ?& array['packId','composition','quantity'])
       or jsonb_typeof(v_item->'quantity') is distinct from 'number'
       or (v_item->>'quantity') !~ '^[1-9][0-9]?$' then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty not between 1 and 10 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
    select * into v_pack from public.packs where code = v_item->>'packId' and active and currency = 'EUR';
    if v_pack.id is null then raise exception 'invalid_pack' using errcode = '22023'; end if;
    v_composition := v_item->'composition';
    if jsonb_typeof(v_composition) is distinct from 'object' then
      raise exception 'invalid_composition' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(v_composition)) not between 1 and 3 then
      raise exception 'invalid_composition' using errcode = '22023';
    end if;
    v_size := 0;
    for v_finish, v_value in select key, value::text from jsonb_each(v_composition) loop
      if v_finish not in ('black','gold','silver') or v_value !~ '^(0|[1-9][0-9]?)$' then
        raise exception 'invalid_finish' using errcode = '22023';
      end if;
      v_count := v_value::integer;
      select * into v_variant from public.product_variants
        where product_id = v_product.id and color = v_finish and active;
      if v_count > 0 and v_variant.id is null then raise exception 'inactive_finish' using errcode = '22023'; end if;
      v_size := v_size + v_count;
      v_needed := jsonb_set(v_needed, array[v_finish], to_jsonb((v_needed->>v_finish)::integer + v_count * v_qty));
    end loop;
    if v_size <> v_pack.quantity then raise exception 'pack_size_mismatch' using errcode = '22023'; end if;
    v_composition := jsonb_build_object('black',coalesce((v_composition->>'black')::integer,0),
      'gold',coalesce((v_composition->>'gold')::integer,0),
      'silver',coalesce((v_composition->>'silver')::integer,0));
    v_key := v_pack.code || ':' || v_composition::text;
    if v_key = any(v_seen) then raise exception 'duplicate_line' using errcode = '22023'; end if;
    v_seen := array_append(v_seen, v_key);
    v_subtotal := v_subtotal + v_pack.price_cents * v_qty;
    v_lamps := v_lamps + v_pack.quantity * v_qty;
  end loop;
  if v_lamps < 1 or v_lamps > 30 then raise exception 'invalid_lamp_total' using errcode = '22023'; end if;
  if v_lamps > v_inventory.available_quantity - v_inventory.reserved_quantity then
    raise exception 'insufficient_inventory' using errcode = 'P0001';
  end if;
  for v_variant in select * from public.product_variants where product_id = v_product.id order by color loop
    perform 1 from public.variant_inventory where variant_id = v_variant.id for update;
    if not found then raise exception 'missing_finish_inventory'; end if;
  end loop;
  for v_variant in select * from public.product_variants where product_id = v_product.id and active order by color loop
    if (v_needed->>v_variant.color)::integer >
       (select available_quantity - reserved_quantity from public.variant_inventory where variant_id = v_variant.id) then
      raise exception 'insufficient_finish_inventory' using errcode = 'P0001';
    end if;
  end loop;
  insert into public.orders(checkout_attempt_id, selection_signature, checkout_locale, currency, subtotal_cents,
    shipping_cents, total_cents, shipping_country, stripe_expires_at)
  values (p_attempt, p_items, p_locale, 'EUR', v_subtotal, case when p_country = 'FR' then 0 else 1000 end,
    v_subtotal + case when p_country = 'FR' then 0 else 1000 end, p_country, p_expires_at)
  returning * into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into strict v_pack from public.packs where code = v_item->>'packId';
    v_composition := jsonb_build_object('black',coalesce((v_item->'composition'->>'black')::integer,0),
      'gold',coalesce((v_item->'composition'->>'gold')::integer,0),
      'silver',coalesce((v_item->'composition'->>'silver')::integer,0));
    insert into public.order_items(order_id, product_id, variant_id, pack_id, quantity, unit_quantity,
      unit_price_cents, total_price_cents, composition)
    values (v_order.id, v_product.id, null, v_pack.id, v_qty, v_pack.quantity,
      v_pack.price_cents, v_pack.price_cents * v_qty, v_composition);
  end loop;
  update public.inventory set reserved_quantity = reserved_quantity + v_lamps, updated_at = now() where id = v_inventory.id;
  insert into public.inventory_reservations(order_id, quantity, expires_at)
    values (v_order.id, v_lamps, p_expires_at + interval '5 minutes') returning * into v_reservation;
  for v_variant in select * from public.product_variants where product_id = v_product.id and active order by color loop
    v_count := (v_needed->>v_variant.color)::integer;
    if v_count > 0 then
      update public.variant_inventory set reserved_quantity = reserved_quantity + v_count, updated_at = now()
        where variant_id = v_variant.id;
      insert into public.reservation_allocations(reservation_id, variant_id, quantity)
        values (v_reservation.id, v_variant.id, v_count);
    end if;
  end loop;
  return v_order;
end $$;

create or replace function public.commerce_fail_session(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders; v_res public.inventory_reservations; v_alloc record; v_product uuid;
begin
  -- Match the reservation function's global-inventory-first lock order.
  select product_id into strict v_product from public.order_items where order_id = p_order limit 1;
  perform 1 from public.inventory where product_id = v_product for update;
  if not found then raise exception 'missing_inventory'; end if;
  select * into strict v_order from public.orders where id = p_order for update;
  if v_order.stripe_checkout_session_id is not null or v_order.status not in ('creating_session','session_unknown') then return; end if;
  select * into v_res from public.inventory_reservations where order_id = p_order for update;
  if v_res.status = 'held' then
    if (select coalesce(sum(quantity), 0) from public.reservation_allocations
        where reservation_id = v_res.id) <> v_res.quantity then
      raise exception 'reservation_allocation_mismatch';
    end if;
    update public.inventory set reserved_quantity = reserved_quantity - v_res.quantity, updated_at = now()
      where product_id = v_product;
    if not found then raise exception 'missing_inventory'; end if;
    for v_alloc in select * from public.reservation_allocations where reservation_id = v_res.id order by variant_id loop
      update public.variant_inventory set reserved_quantity = reserved_quantity - v_alloc.quantity, updated_at = now()
        where variant_id = v_alloc.variant_id;
      if not found then raise exception 'missing_finish_inventory'; end if;
    end loop;
    update public.inventory_reservations set status = 'released', updated_at = now() where id = v_res.id;
  end if;
  update public.orders set status = 'failed', updated_at = now() where id = p_order;
end $$;

create or replace function public.commerce_process_event(
  p_event_id text, p_event_type text, p_session text, p_payment_status text,
  p_session_status text, p_amount_total integer, p_shipping_country text,
  p_payment_intent text default null, p_email text default null, p_name text default null
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders; v_order_id uuid; v_res public.inventory_reservations;
  v_product uuid; v_alloc record; v_result text := 'processed';
begin
  insert into public.payment_events(stripe_event_id,event_type) values (p_event_id,p_event_type)
    on conflict (stripe_event_id) do nothing;
  if exists (select 1 from public.payment_events where stripe_event_id = p_event_id and processing_status = 'processed') then
    return 'duplicate';
  end if;
  select id into v_order_id from public.orders where stripe_checkout_session_id = p_session;
  if not found then raise exception 'unknown_session'; end if;
  select product_id into strict v_product from public.order_items where order_id = v_order_id limit 1;
  perform 1 from public.inventory where product_id = v_product for update;
  if not found then raise exception 'missing_inventory'; end if;
  select * into strict v_order from public.orders where id = v_order_id for update;
  if v_order.stripe_checkout_session_id is distinct from p_session then raise exception 'session_conflict'; end if;
  if p_amount_total is distinct from v_order.total_cents or p_shipping_country is distinct from v_order.shipping_country then
    raise exception 'payment_mismatch';
  end if;
  select * into strict v_res from public.inventory_reservations where order_id = v_order.id for update;
  if v_res.status = 'held' and
     (select coalesce(sum(quantity), 0) from public.reservation_allocations
      where reservation_id = v_res.id) <> v_res.quantity then
    raise exception 'reservation_allocation_mismatch';
  end if;
  if p_payment_status = 'paid' and p_session_status = 'complete'
     and p_event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded','reconcile') then
    if v_res.status = 'held' then
      update public.inventory set available_quantity = available_quantity - v_res.quantity,
        reserved_quantity = reserved_quantity - v_res.quantity, updated_at = now() where product_id = v_product;
      if not found then raise exception 'missing_inventory'; end if;
      for v_alloc in select * from public.reservation_allocations where reservation_id = v_res.id order by variant_id loop
        update public.variant_inventory set available_quantity = available_quantity - v_alloc.quantity,
          reserved_quantity = reserved_quantity - v_alloc.quantity, updated_at = now() where variant_id = v_alloc.variant_id;
        if not found then raise exception 'missing_finish_inventory'; end if;
      end loop;
      update public.inventory_reservations set status = 'committed', updated_at = now() where id = v_res.id;
    elsif v_res.status = 'released' then raise exception 'paid_after_release'; end if;
    update public.orders set status = 'paid', stripe_payment_intent_id = coalesce(p_payment_intent,stripe_payment_intent_id),
      customer_email = coalesce(p_email,customer_email), customer_name = coalesce(p_name,customer_name),
      updated_at = now() where id = v_order.id;
  elsif v_order.status = 'paid' then v_result := 'already_paid';
  elsif p_event_type in ('checkout.session.completed','reconcile') and p_session_status = 'complete' then
    update public.orders set status = 'payment_processing', updated_at = now() where id = v_order.id;
  elsif ((p_event_type = 'checkout.session.expired' or (p_event_type = 'reconcile' and p_session_status = 'expired'))
      and p_session_status = 'expired' and p_payment_status = 'unpaid')
      or (p_event_type = 'checkout.session.async_payment_failed' and p_payment_status = 'unpaid') then
    if v_res.status = 'held' then
      update public.inventory set reserved_quantity = reserved_quantity - v_res.quantity, updated_at = now()
        where product_id = v_product;
      if not found then raise exception 'missing_inventory'; end if;
      for v_alloc in select * from public.reservation_allocations where reservation_id = v_res.id order by variant_id loop
        update public.variant_inventory set reserved_quantity = reserved_quantity - v_alloc.quantity, updated_at = now()
          where variant_id = v_alloc.variant_id;
        if not found then raise exception 'missing_finish_inventory'; end if;
      end loop;
      update public.inventory_reservations set status = 'released', updated_at = now() where id = v_res.id;
    end if;
    update public.orders set status = case when p_session_status = 'expired' then 'expired' else 'failed' end,
      updated_at = now() where id = v_order.id;
  end if;
  update public.payment_events set processing_status = 'processed', processed_at = now() where stripe_event_id = p_event_id;
  return v_result;
end $$;

-- CREATE OR REPLACE normally retains existing grants. State the intended RPC
-- boundary explicitly so a different database default cannot broaden it.
revoke all on function public.commerce_reserve_checkout(uuid, text, jsonb, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.commerce_fail_session(uuid)
  from public, anon, authenticated;
revoke all on function public.commerce_process_event(text, text, text, text, text, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.commerce_reserve_checkout(uuid, text, jsonb, timestamptz, text)
  to service_role;
grant execute on function public.commerce_fail_session(uuid) to service_role;
grant execute on function public.commerce_process_event(text, text, text, text, text, integer, text, text, text, text)
  to service_role;

-- A failed assertion aborts this transaction before COMMIT. Do not tolerate
-- historical released or committed reservations as active stock deductions.
do $$
declare
  v_product uuid;
  v_role text;
  v_table text;
  v_privilege text;
  v_function text;
begin
  select id into strict v_product from public.products where sku = 'LUMIZA-LED-01';
  if (select count(*) from public.variant_inventory vi
      join public.product_variants pv on pv.id = vi.variant_id
      where pv.product_id = v_product and pv.color in ('black', 'gold', 'silver')
        and vi.available_quantity = 50 and vi.reserved_quantity = 0) <> 3
     or (select count(*) from public.variant_inventory) <> 3 then
    raise exception 'finish inventory must be exactly 50/0 for Black, Gold and Silver';
  end if;
  if not exists (select 1 from public.inventory
      where product_id = v_product and available_quantity = 150 and reserved_quantity = 0) then
    raise exception 'global inventory must be exactly 150/0';
  end if;
  if exists (select 1 from public.inventory_reservations where status = 'held') then
    raise exception 'active legacy reservation remains';
  end if;
  if exists (select 1 from public.inventory_reservations ir
    left join public.reservation_allocations ra on ra.reservation_id = ir.id
    group by ir.id, ir.quantity having coalesce(sum(ra.quantity), 0) <> ir.quantity) then
    raise exception 'historical reservation allocation mismatch';
  end if;
  if to_regclass('public.variant_inventory') is null
     or to_regclass('public.reservation_allocations') is null
     or to_regclass('public.order_items_pack_composition_idx') is null
     or to_regclass('public.reservation_allocations_variant_idx') is null
     or not exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'order_items' and column_name = 'composition')
     or not exists (select 1 from pg_constraint
       where conrelid = 'public.order_items'::regclass and conname = 'order_items_composition_valid')
     or (select count(*) from pg_constraint where contype = 'f'
       and conrelid in ('public.variant_inventory'::regclass,
         'public.reservation_allocations'::regclass)) <> 3 then
    raise exception 'required mixed-finish schema object is missing';
  end if;
  if exists (select 1 from pg_class where oid in
      ('public.products'::regclass, 'public.product_variants'::regclass,
       'public.packs'::regclass, 'public.inventory'::regclass,
       'public.inventory_reservations'::regclass, 'public.orders'::regclass,
       'public.order_items'::regclass, 'public.payment_events'::regclass,
       'public.confirmation_email_outbox'::regclass,
       'public.variant_inventory'::regclass, 'public.reservation_allocations'::regclass)
      and not relrowsecurity) then
    raise exception 'RLS is disabled on a protected commerce table';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_table in array array[
      'public.products', 'public.product_variants', 'public.packs',
      'public.inventory', 'public.inventory_reservations',
      'public.variant_inventory', 'public.reservation_allocations',
      'public.orders', 'public.order_items', 'public.payment_events',
      'public.confirmation_email_outbox'
    ] loop
      foreach v_privilege in array array['INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(v_role, v_table, v_privilege) then
          raise exception 'public commerce mutation privilege detected: %, %, %',
            v_role, v_table, v_privilege;
        end if;
      end loop;
    end loop;
    foreach v_function in array array[
      'public.commerce_reserve_checkout(uuid,text,jsonb,timestamptz,text)',
      'public.commerce_attach_session(uuid,text,text,timestamptz)',
      'public.commerce_fail_session(uuid)',
      'public.commerce_mark_session_unknown(uuid)',
      'public.commerce_process_event(text,text,text,text,text,integer,text,text,text,text)',
      'public.commerce_enqueue_paid_email(text)',
      'public.commerce_backfill_paid_emails()',
      'public.commerce_claim_confirmation_email(uuid)',
      'public.commerce_finish_confirmation_email(uuid,uuid,boolean)'
    ] loop
      if has_function_privilege(v_role, v_function, 'EXECUTE') then
        raise exception 'public commerce RPC execution privilege detected: %, %',
          v_role, v_function;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('service_role',
      'public.commerce_reserve_checkout(uuid,text,jsonb,timestamptz,text)', 'EXECUTE')
     or not has_table_privilege('service_role', 'public.variant_inventory', 'SELECT')
     or not has_table_privilege('service_role', 'public.reservation_allocations', 'SELECT') then
    raise exception 'server-side mixed-finish access is missing';
  end if;
end $$;

-- Tell Supabase PostgREST to discover the new column, tables and RPC body.
notify pgrst, 'reload schema';

commit;

-- Expected SQL Editor result: Black 50/0/50, Gold 50/0/50,
-- Silver 50/0/50, TOTAL 150/0/150, active_reservations 0.
select pv.color as finish, vi.available_quantity as physical_quantity,
  vi.reserved_quantity,
  vi.available_quantity - vi.reserved_quantity as immediately_available,
  (select count(*) from public.inventory_reservations where status = 'held') as active_reservations
from public.variant_inventory vi
join public.product_variants pv on pv.id = vi.variant_id
join public.products p on p.id = pv.product_id
where p.sku = 'LUMIZA-LED-01'
union all
select 'TOTAL', i.available_quantity, i.reserved_quantity,
  i.available_quantity - i.reserved_quantity,
  (select count(*) from public.inventory_reservations where status = 'held')
from public.inventory i
join public.products p on p.id = i.product_id
where p.sku = 'LUMIZA-LED-01'
order by finish;
