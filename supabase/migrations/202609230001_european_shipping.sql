-- Restrict the Step 3 test-market shipping zone without changing its price or reservation model.
-- Keep these ISO codes aligned with src/features/commerce/domain/shipping.ts.
alter table public.orders drop constraint if exists orders_shipping_country_check;
alter table public.orders add constraint orders_shipping_country_check check (
  shipping_country in (
    'FR','BE','DE','CH'
  )
);

create or replace function public.commerce_reserve_checkout(
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
  if p_country not in (
    'FR','BE','DE','CH'
  ) or p_locale not in ('fr', 'en', 'de') then
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
