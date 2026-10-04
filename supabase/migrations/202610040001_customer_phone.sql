-- Apply before deploying phone collection. Existing orders remain unchanged.
alter table public.orders add column customer_phone text;

-- The application calls this only with a Stripe-verified Checkout Session.
-- A retry fills a missing phone; a replay never overwrites an existing one.
create function public.commerce_capture_customer_phone(p_session text, p_phone text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_order public.orders;
begin
  if p_phone is null or p_phone = '' then return; end if;
  select * into v_order from public.orders
    where stripe_checkout_session_id = p_session for update;
  if not found or v_order.status <> 'paid' then
    raise exception 'paid_order_not_found';
  end if;
  if v_order.customer_phone is null then
    update public.orders set customer_phone = p_phone, updated_at = now()
      where id = v_order.id;
  end if;
end $$;

revoke all on function public.commerce_capture_customer_phone(text, text)
  from public, anon, authenticated;
grant execute on function public.commerce_capture_customer_phone(text, text)
  to service_role;
