-- Step 4: minimal, service-role-only transactional email outbox.
-- Apply to Supabase TEST manually. No provider is activated by this migration.
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
create index confirmation_email_outbox_pending_idx on public.confirmation_email_outbox(status, locked_until, created_at);
alter table public.confirmation_email_outbox enable row level security;
revoke all on public.confirmation_email_outbox from anon, authenticated;
grant select on public.confirmation_email_outbox to service_role;

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

revoke all on function public.commerce_enqueue_paid_email(text) from public, anon, authenticated;
revoke all on function public.commerce_backfill_paid_emails() from public, anon, authenticated;
revoke all on function public.commerce_claim_confirmation_email(uuid) from public, anon, authenticated;
revoke all on function public.commerce_finish_confirmation_email(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.commerce_enqueue_paid_email(text) to service_role;
grant execute on function public.commerce_backfill_paid_emails() to service_role;
grant execute on function public.commerce_claim_confirmation_email(uuid) to service_role;
grant execute on function public.commerce_finish_confirmation_email(uuid, uuid, boolean) to service_role;
