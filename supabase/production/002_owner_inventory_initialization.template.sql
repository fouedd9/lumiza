-- MANUAL TEMPLATE, NOT AN AUTOMATIC MIGRATION. Use only after 001 succeeds on
-- a fresh production project and the owner confirms the physical on-hand count
-- for each finish. Replace all three NULL values with explicit approved integers.
-- The unchanged template fails before altering any stock. Never use TEST counts.
begin;
set local lock_timeout = '15s';
set local statement_timeout = '30s';
lock table public.inventory, public.variant_inventory, public.orders,
  public.inventory_reservations, public.reservation_allocations,
  public.payment_events, public.confirmation_email_outbox in access exclusive mode;

do $$
declare
  v_black integer := null;
  v_gold integer := null;
  v_silver integer := null;
  v_product uuid;
begin
  if v_black is null or v_gold is null or v_silver is null
     or least(v_black,v_gold,v_silver) < 0 then
    raise exception 'owner-approved nonnegative Black, Gold and Silver counts are required';
  end if;
  if exists (select 1 from public.orders)
     or exists (select 1 from public.order_items)
     or exists (select 1 from public.inventory_reservations)
     or exists (select 1 from public.reservation_allocations)
     or exists (select 1 from public.payment_events)
     or exists (select 1 from public.confirmation_email_outbox) then
    raise exception 'inventory initialization is allowed only before the first transaction';
  end if;
  select id into strict v_product from public.products
    where sku = 'LUMIZA-LED-01' and active;
  if (select count(*) from public.products) <> 1
     or (select count(*) from public.inventory) <> 1
     or (select count(*) from public.variant_inventory) <> 3
     or (select count(*) from public.product_variants where product_id = v_product
      and active and color in ('black','gold','silver')) <> 3
     or (select count(*) from public.product_variants where product_id = v_product) <> 3
     or (select count(*) from public.variant_inventory vi
       join public.product_variants pv on pv.id = vi.variant_id
       where pv.product_id = v_product and vi.available_quantity = 0
         and vi.reserved_quantity = 0) <> 3
     or not exists (select 1 from public.inventory where product_id = v_product
       and available_quantity = 0 and reserved_quantity = 0) then
    raise exception 'expected zero-stock three-finish bootstrap not found';
  end if;
  update public.variant_inventory vi
    set available_quantity = case pv.color
      when 'black' then v_black when 'gold' then v_gold when 'silver' then v_silver end,
      updated_at = now()
    from public.product_variants pv
    where pv.id = vi.variant_id and pv.product_id = v_product;
  update public.inventory set available_quantity = v_black + v_gold + v_silver,
    updated_at = now() where product_id = v_product;
  if (select available_quantity from public.inventory where product_id = v_product)
       is distinct from
     (select sum(vi.available_quantity)::integer from public.variant_inventory vi
       join public.product_variants pv on pv.id = vi.variant_id
       where pv.product_id = v_product) then
    raise exception 'global and finish inventory disagree';
  end if;
end $$;
commit;
