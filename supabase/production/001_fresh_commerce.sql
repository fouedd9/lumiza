-- PRODUCTION ONLY: fresh-project bootstrap. Do not run the historical TEST migrations
-- before or after this file. Apply as one transaction to an otherwise empty
-- commerce schema. No orders, reservations, events, email jobs or physical stock
-- are imported. Owner-confirmed stock is initialized separately.
begin;
set local lock_timeout = '15s';
set local statement_timeout = '120s';

do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p','v','m','f','S')
  ) or exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'commerce_%'
  ) then
    raise exception 'fresh commerce bootstrap requires an empty public data schema';
  end if;
end $$;

create extension if not exists pgcrypto;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  color text not null check (color in ('black', 'gold', 'silver')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, color),
  unique (id, product_id)
);

create table public.packs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('solo', 'duo', 'pro')),
  quantity integer not null check (quantity > 0),
  price_cents integer not null check (price_cents >= 0),
  currency text not null check (currency = 'EUR'),
  active boolean not null default true
);

-- Global inventory is the serializing lock and aggregate of finish inventory.
-- Zero is deliberate: no sale can reserve stock before owner initialization.
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id),
  available_quantity integer not null check (available_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  updated_at timestamptz not null default now(),
  check (reserved_quantity <= available_quantity)
);

create table public.variant_inventory (
  variant_id uuid primary key references public.product_variants(id),
  available_quantity integer not null check (available_quantity >= 0),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  updated_at timestamptz not null default now(),
  check (reserved_quantity <= available_quantity)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_order_reference text not null unique default ('LZ-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  checkout_attempt_id uuid not null unique,
  selection_signature jsonb not null,
  checkout_locale text not null check (checkout_locale in ('fr', 'en', 'de')),
  confirmation_token uuid not null unique default gen_random_uuid(),
  status text not null default 'creating_session' check (status in ('creating_session', 'session_unknown', 'pending_payment', 'payment_processing', 'paid', 'failed', 'expired')),
  currency text not null check (currency = 'EUR'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  tax_cents integer check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  customer_email text,
  customer_name text,
  shipping_country text not null check (shipping_country in ('FR', 'BE', 'DE', 'CH')),
  stripe_checkout_session_id text unique,
  stripe_client_secret text,
  stripe_payment_intent_id text unique,
  stripe_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents = subtotal_cents + shipping_cents + coalesce(tax_cents, 0))
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  pack_id uuid not null references public.packs(id),
  quantity integer not null check (quantity between 1 and 10),
  unit_quantity integer not null check (unit_quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_price_cents integer not null check (total_price_cents = quantity * unit_price_cents),
  composition jsonb not null,
  constraint order_items_composition_valid check (
    coalesce(jsonb_typeof(composition->'black') = 'number', false)
    and coalesce(jsonb_typeof(composition->'gold') = 'number', false)
    and coalesce(jsonb_typeof(composition->'silver') = 'number', false)
    and composition = jsonb_build_object(
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
  ),
  unique (order_id, variant_id, pack_id)
);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  quantity integer not null check (quantity between 1 and 30),
  status text not null default 'held' check (status in ('held', 'committed', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reservation_allocations (
  reservation_id uuid not null references public.inventory_reservations(id),
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  primary key (reservation_id, variant_id)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processing_status text not null default 'processing' check (processing_status in ('processing', 'processed')),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.confirmation_email_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  worker_id uuid,
  locked_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_status_expiry_idx on public.orders(status, stripe_expires_at);
create index reservations_status_expiry_idx on public.inventory_reservations(status, expires_at);
create index order_items_order_idx on public.order_items(order_id);
create unique index order_items_pack_composition_idx on public.order_items(order_id, pack_id, composition);
create index reservation_allocations_variant_idx on public.reservation_allocations(variant_id);
create index payment_events_processing_idx on public.payment_events(processing_status, created_at);
create index confirmation_email_outbox_pending_idx on public.confirmation_email_outbox(status, locked_until, created_at);

-- Catalog only. No transactional rows or nonzero inventory are seeded.
insert into public.products(sku) values ('LUMIZA-LED-01');
insert into public.product_variants(product_id, color)
select id, color from public.products cross join (values ('black'), ('gold'), ('silver')) as colors(color)
where sku = 'LUMIZA-LED-01';
insert into public.packs(code, quantity, price_cents, currency)
values ('solo', 1, 3499, 'EUR'), ('duo', 2, 5999, 'EUR'), ('pro', 10, 24999, 'EUR');
insert into public.inventory(product_id, available_quantity, reserved_quantity)
select id, 0, 0 from public.products where sku = 'LUMIZA-LED-01';
insert into public.variant_inventory(variant_id, available_quantity, reserved_quantity)
select pv.id, 0, 0 from public.product_variants pv
join public.products p on p.id = pv.product_id where p.sku = 'LUMIZA-LED-01';

-- No direct browser access. Server reads use service_role; all writes go
-- through the reviewed SECURITY DEFINER RPCs.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'products','product_variants','packs','inventory','variant_inventory',
    'orders','order_items','inventory_reservations','reservation_allocations',
    'payment_events','confirmation_email_outbox'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
    execute format('grant select on public.%I to service_role', v_table);
  end loop;
end $$;

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

create function public.commerce_attach_session(
  p_order uuid, p_session text, p_client_secret text, p_expires_at timestamptz
) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders;
begin
  select * into strict v_order from public.orders where id = p_order for update;
  if v_order.stripe_checkout_session_id is not null and v_order.stripe_checkout_session_id <> p_session then
    raise exception 'session_conflict';
  end if;
  update public.orders set stripe_checkout_session_id = p_session,
    stripe_client_secret = p_client_secret, stripe_expires_at = p_expires_at,
    status = case when status in ('creating_session', 'session_unknown') then 'pending_payment' else status end,
    updated_at = now() where id = p_order returning * into v_order;
  update public.inventory_reservations set expires_at = p_expires_at + interval '5 minutes', updated_at = now()
    where order_id = p_order and status = 'held';
  return v_order;
end $$;

create function public.commerce_mark_session_unknown(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.orders set status = 'session_unknown', updated_at = now()
  where id = p_order and status = 'creating_session' and stripe_checkout_session_id is null;
end $$;

create function public.commerce_enqueue_paid_email(p_session text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders; v_inserted integer;
begin
  select * into v_order from public.orders where stripe_checkout_session_id = p_session;
  if not found or v_order.status <> 'paid' or v_order.customer_email is null then return false; end if;
  insert into public.confirmation_email_outbox(order_id) values (v_order.id)
    on conflict (order_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end $$;

-- Recovers paid orders whose webhook completed before the outbox migration or
-- whose enqueue failed transiently. The unique order key makes it repeatable.
create function public.commerce_backfill_paid_emails() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_inserted integer;
begin
  insert into public.confirmation_email_outbox(order_id)
  select id from public.orders
  where status = 'paid' and customer_email is not null
  on conflict (order_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end $$;

create function public.commerce_claim_confirmation_email(p_worker uuid)
returns public.confirmation_email_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.confirmation_email_outbox;
begin
  select * into v_job from public.confirmation_email_outbox
  where (status = 'pending' or (status = 'sending' and locked_until < now()))
    and attempts < 5
  order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.confirmation_email_outbox set status = 'sending', attempts = attempts + 1,
    worker_id = p_worker, locked_until = now() + interval '10 minutes', updated_at = now()
  where id = v_job.id returning * into v_job;
  return v_job;
end $$;

create function public.commerce_finish_confirmation_email(p_job uuid, p_worker uuid, p_success boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.confirmation_email_outbox set
    status = case when p_success then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
    sent_at = case when p_success then now() else sent_at end,
    worker_id = null, locked_until = null, updated_at = now()
  where id = p_job and worker_id = p_worker and status = 'sending';
  if not found then raise exception 'email_claim_conflict'; end if;
end $$;

-- Explicitly remove PostgreSQL's default PUBLIC EXECUTE from every commerce
-- function. Only the server's service_role may invoke these RPCs.
revoke all on function public.commerce_reserve_checkout(uuid,text,jsonb,timestamptz,text) from public, anon, authenticated;
revoke all on function public.commerce_attach_session(uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.commerce_fail_session(uuid) from public, anon, authenticated;
revoke all on function public.commerce_mark_session_unknown(uuid) from public, anon, authenticated;
revoke all on function public.commerce_process_event(text,text,text,text,text,integer,text,text,text,text) from public, anon, authenticated;
revoke all on function public.commerce_enqueue_paid_email(text) from public, anon, authenticated;
revoke all on function public.commerce_backfill_paid_emails() from public, anon, authenticated;
revoke all on function public.commerce_claim_confirmation_email(uuid) from public, anon, authenticated;
revoke all on function public.commerce_finish_confirmation_email(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.commerce_reserve_checkout(uuid,text,jsonb,timestamptz,text) to service_role;
grant execute on function public.commerce_attach_session(uuid,text,text,timestamptz) to service_role;
grant execute on function public.commerce_fail_session(uuid) to service_role;
grant execute on function public.commerce_mark_session_unknown(uuid) to service_role;
grant execute on function public.commerce_process_event(text,text,text,text,text,integer,text,text,text,text) to service_role;
grant execute on function public.commerce_enqueue_paid_email(text) to service_role;
grant execute on function public.commerce_backfill_paid_emails() to service_role;
grant execute on function public.commerce_claim_confirmation_email(uuid) to service_role;
grant execute on function public.commerce_finish_confirmation_email(uuid,uuid,boolean) to service_role;

-- Abort the transaction if this is not the intended, empty final schema.
do $$
declare v_role text; v_table text; v_function text; v_privilege text;
begin
  if (select count(*) from public.products where sku = 'LUMIZA-LED-01' and active) <> 1
     or (select count(*) from public.product_variants where active and color in ('black','gold','silver')) <> 3
     or (select count(*) from public.packs where active and currency = 'EUR'
       and (code,quantity,price_cents) in
         (('solo',1,3499),('duo',2,5999),('pro',10,24999))) <> 3
     or (select count(*) from public.packs) <> 3
     or (select count(*) from public.inventory where available_quantity = 0 and reserved_quantity = 0) <> 1
     or (select count(*) from public.variant_inventory where available_quantity = 0 and reserved_quantity = 0) <> 3 then
    raise exception 'production catalog or zero-stock seed mismatch';
  end if;
  if exists (select 1 from public.orders)
     or exists (select 1 from public.order_items)
     or exists (select 1 from public.inventory_reservations)
     or exists (select 1 from public.reservation_allocations)
     or exists (select 1 from public.payment_events)
     or exists (select 1 from public.confirmation_email_outbox) then
    raise exception 'fresh production bootstrap contains transactional history';
  end if;
  foreach v_table in array array[
    'products','product_variants','packs','inventory','variant_inventory',
    'orders','order_items','inventory_reservations','reservation_allocations',
    'payment_events','confirmation_email_outbox'
  ] loop
    if not exists (select 1 from pg_class
      where oid = format('public.%I',v_table)::regclass and relrowsecurity) then
      raise exception 'RLS missing on %', v_table;
    end if;
    foreach v_role in array array['anon','authenticated'] loop
      foreach v_privilege in array array['SELECT','INSERT','UPDATE','DELETE'] loop
        if has_table_privilege(v_role, format('public.%I',v_table), v_privilege) then
          raise exception 'browser table privilege detected: %, %, %', v_role, v_table, v_privilege;
        end if;
      end loop;
    end loop;
    if not has_table_privilege('service_role', format('public.%I',v_table), 'SELECT') then
      raise exception 'service_role SELECT missing on %', v_table;
    end if;
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
    if has_function_privilege('anon', v_function, 'EXECUTE')
       or has_function_privilege('authenticated', v_function, 'EXECUTE')
       or not has_function_privilege('service_role', v_function, 'EXECUTE') then
      raise exception 'commerce RPC privilege mismatch: %', v_function;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
