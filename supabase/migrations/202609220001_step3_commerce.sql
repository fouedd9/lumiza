-- LUMIZA Step 3. Apply with Supabase CLI or the SQL editor in test mode only.
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

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id),
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
  shipping_country text not null check (shipping_country in ('FR', 'DE')),
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

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processing_status text not null default 'processing' check (processing_status in ('processing', 'processed')),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index orders_status_expiry_idx on public.orders(status, stripe_expires_at);
create index reservations_status_expiry_idx on public.inventory_reservations(status, expires_at);
create index order_items_order_idx on public.order_items(order_id);
create index payment_events_processing_idx on public.payment_events(processing_status, created_at);

-- No direct anonymous/authenticated access, even to otherwise public catalog rows.
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.packs enable row level security;
alter table public.inventory enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.payment_events enable row level security;

insert into public.products(sku) values ('LUMIZA-LED-01');
insert into public.product_variants(product_id, color)
select id, color from public.products cross join (values ('black'), ('gold'), ('silver')) as colors(color)
where sku = 'LUMIZA-LED-01';
-- Keep this seed in sync with src/features/product/data/product.ts. Checkout refuses a mismatch.
insert into public.packs(code, quantity, price_cents, currency)
values ('solo', 1, 3499, 'EUR'), ('duo', 2, 5999, 'EUR'), ('pro', 10, 24999, 'EUR');
insert into public.inventory(product_id, available_quantity, reserved_quantity)
select id, 30, 0 from public.products where sku = 'LUMIZA-LED-01';

-- A single transaction locks the product inventory row and reserves physical lamps.
create function public.commerce_reserve_checkout(
  p_attempt uuid, p_country text, p_items jsonb, p_expires_at timestamptz, p_locale text
) returns public.orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders;
  v_inventory public.inventory;
  v_product public.products;
  v_item jsonb;
  v_pack public.packs;
  v_variant public.product_variants;
  v_subtotal integer := 0;
  v_lamps integer := 0;
  v_qty integer;
begin
  if p_country not in ('FR', 'DE') or p_locale not in ('fr', 'en', 'de') then
    raise exception 'invalid_checkout' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 10 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;
  select * into v_order from public.orders where checkout_attempt_id = p_attempt;
  if found then
    if v_order.shipping_country <> p_country or v_order.checkout_locale <> p_locale or v_order.selection_signature <> p_items then
      raise exception 'attempt_conflict';
    end if;
    return v_order;
  end if;
  if p_expires_at < now() + interval '30 minutes' or p_expires_at > now() + interval '24 hours' then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;
  select * into strict v_product from public.products where sku = 'LUMIZA-LED-01' and active;
  select * into strict v_inventory from public.inventory where product_id = v_product.id for update;
  -- Another request may have created this attempt while waiting for the row lock.
  select * into v_order from public.orders where checkout_attempt_id = p_attempt;
  if found then
    if v_order.shipping_country <> p_country or v_order.checkout_locale <> p_locale or v_order.selection_signature <> p_items then
      raise exception 'attempt_conflict';
    end if;
    return v_order;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item->'quantity') is distinct from 'number' then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty not between 1 and 10 then raise exception 'invalid_quantity' using errcode = '22023'; end if;
    select * into v_pack from public.packs where code = v_item->>'packId' and active and currency = 'EUR';
    select * into v_variant from public.product_variants
      where product_id = v_product.id and color = v_item->>'color' and active;
    if v_pack.id is null or v_variant.id is null then raise exception 'invalid_selection' using errcode = '22023'; end if;
    v_subtotal := v_subtotal + v_pack.price_cents * v_qty;
    v_lamps := v_lamps + v_pack.quantity * v_qty;
  end loop;
  if v_lamps > 30 or v_lamps > v_inventory.available_quantity - v_inventory.reserved_quantity then
    raise exception 'insufficient_inventory' using errcode = 'P0001';
  end if;
  insert into public.orders(checkout_attempt_id, selection_signature, checkout_locale, currency, subtotal_cents, shipping_cents,
    total_cents, shipping_country, stripe_expires_at)
  values (p_attempt, p_items, p_locale, 'EUR', v_subtotal, case when p_country = 'FR' then 0 else 1000 end,
    v_subtotal + case when p_country = 'FR' then 0 else 1000 end, p_country, p_expires_at)
  returning * into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_pack from public.packs where code = v_item->>'packId';
    select * into v_variant from public.product_variants
      where product_id = v_product.id and color = v_item->>'color';
    insert into public.order_items(order_id, product_id, variant_id, pack_id, quantity,
      unit_quantity, unit_price_cents, total_price_cents)
    values (v_order.id, v_product.id, v_variant.id, v_pack.id, v_qty,
      v_pack.quantity, v_pack.price_cents, v_pack.price_cents * v_qty);
  end loop;
  update public.inventory set reserved_quantity = reserved_quantity + v_lamps, updated_at = now()
    where id = v_inventory.id;
  insert into public.inventory_reservations(order_id, quantity, expires_at)
    values (v_order.id, v_lamps, p_expires_at + interval '5 minutes');
  return v_order;
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

-- Only a definite pre-session failure may call this function. Network uncertainty keeps stock held.
create function public.commerce_fail_session(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders; v_res public.inventory_reservations;
begin
  select * into strict v_order from public.orders where id = p_order for update;
  if v_order.stripe_checkout_session_id is not null or v_order.status not in ('creating_session', 'session_unknown') then return; end if;
  select * into v_res from public.inventory_reservations where order_id = p_order for update;
  if v_res.status = 'held' then
    update public.inventory set reserved_quantity = reserved_quantity - v_res.quantity,
      updated_at = now() where product_id = (select product_id from public.order_items where order_id = p_order limit 1);
    update public.inventory_reservations set status = 'released', updated_at = now() where id = v_res.id;
  end if;
  update public.orders set status = 'failed', updated_at = now() where id = p_order;
end $$;

create function public.commerce_mark_session_unknown(p_order uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.orders set status = 'session_unknown', updated_at = now()
  where id = p_order and status = 'creating_session' and stripe_checkout_session_id is null;
end $$;

-- The event insert and stock transition commit together. A failed call rolls both back.
create function public.commerce_process_event(
  p_event_id text, p_event_type text, p_session text, p_payment_status text,
  p_session_status text, p_amount_total integer, p_shipping_country text,
  p_payment_intent text default null, p_email text default null, p_name text default null
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders; v_res public.inventory_reservations; v_product uuid; v_result text := 'processed';
begin
  insert into public.payment_events(stripe_event_id, event_type) values (p_event_id, p_event_type)
    on conflict (stripe_event_id) do nothing;
  if exists (select 1 from public.payment_events where stripe_event_id = p_event_id and processing_status = 'processed') then
    return 'duplicate';
  end if;
  select * into v_order from public.orders where stripe_checkout_session_id = p_session for update;
  if not found then raise exception 'unknown_session'; end if;
  if p_amount_total is distinct from v_order.total_cents or p_shipping_country is distinct from v_order.shipping_country then
    raise exception 'payment_mismatch';
  end if;
  select * into strict v_res from public.inventory_reservations where order_id = v_order.id for update;
  select product_id into strict v_product from public.order_items where order_id = v_order.id limit 1;
  if p_payment_status = 'paid' and p_session_status = 'complete'
     and p_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded', 'reconcile') then
    if v_res.status = 'held' then
      update public.inventory set available_quantity = available_quantity - v_res.quantity,
        reserved_quantity = reserved_quantity - v_res.quantity, updated_at = now() where product_id = v_product;
      update public.inventory_reservations set status = 'committed', updated_at = now() where id = v_res.id;
    elsif v_res.status = 'released' then
      raise exception 'paid_after_release';
    end if;
    update public.orders set status = 'paid', stripe_payment_intent_id = coalesce(p_payment_intent, stripe_payment_intent_id),
      customer_email = coalesce(p_email, customer_email), customer_name = coalesce(p_name, customer_name),
      updated_at = now() where id = v_order.id;
  elsif v_order.status = 'paid' then
    v_result := 'already_paid';
  elsif p_event_type in ('checkout.session.completed', 'reconcile') and p_session_status = 'complete' then
    update public.orders set status = 'payment_processing', updated_at = now() where id = v_order.id;
  elsif (p_event_type = 'checkout.session.expired' or (p_event_type = 'reconcile' and p_session_status = 'expired'))
    and p_session_status = 'expired' and p_payment_status = 'unpaid' then
    if v_res.status = 'held' then
      update public.inventory set reserved_quantity = reserved_quantity - v_res.quantity,
        updated_at = now() where product_id = v_product;
      update public.inventory_reservations set status = 'released', updated_at = now() where id = v_res.id;
    end if;
    update public.orders set status = 'expired', updated_at = now() where id = v_order.id;
  elsif p_event_type = 'checkout.session.async_payment_failed' and p_payment_status = 'unpaid' then
    if v_res.status = 'held' then
      update public.inventory set reserved_quantity = reserved_quantity - v_res.quantity,
        updated_at = now() where product_id = v_product;
      update public.inventory_reservations set status = 'released', updated_at = now() where id = v_res.id;
    end if;
    update public.orders set status = 'failed', updated_at = now() where id = v_order.id;
  end if;
  update public.payment_events set processing_status = 'processed', processed_at = now()
    where stripe_event_id = p_event_id;
  return v_result;
end $$;

revoke all on public.products, public.product_variants, public.packs, public.inventory,
  public.orders, public.order_items, public.inventory_reservations, public.payment_events from anon, authenticated;
grant select on public.orders, public.order_items, public.packs, public.product_variants to service_role;
revoke all on function public.commerce_reserve_checkout(uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;
revoke all on function public.commerce_attach_session(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.commerce_fail_session(uuid) from public, anon, authenticated;
revoke all on function public.commerce_mark_session_unknown(uuid) from public, anon, authenticated;
revoke all on function public.commerce_process_event(text, text, text, text, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.commerce_reserve_checkout(uuid, text, jsonb, timestamptz, text) to service_role;
grant execute on function public.commerce_attach_session(uuid, text, text, timestamptz) to service_role;
grant execute on function public.commerce_fail_session(uuid) to service_role;
grant execute on function public.commerce_mark_session_unknown(uuid) to service_role;
grant execute on function public.commerce_process_event(text, text, text, text, text, integer, text, text, text, text) to service_role;
