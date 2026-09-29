-- Owner Telegram alerts are secondary to the committed payment transaction.
-- Apply before deploying the notification code. No existing orders are backfilled.
create table public.owner_telegram_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'uncertain', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  worker_id uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index owner_telegram_pending_idx
  on public.owner_telegram_outbox(status, created_at);
alter table public.owner_telegram_outbox enable row level security;
revoke all on public.owner_telegram_outbox from public, anon, authenticated;
grant select on public.owner_telegram_outbox to service_role;

-- Only a real state transition creates a job; old paid orders and webhook
-- replays cannot enqueue historical notifications. Outbox errors are isolated
-- so a secondary alert cannot roll back the paid transaction.
create function public.commerce_queue_paid_telegram() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.owner_telegram_outbox(order_id) values (new.id)
    on conflict (order_id) do nothing;
  return new;
exception when others then
  raise warning 'telegram_outbox_enqueue_failed';
  return new;
end $$;
create trigger orders_queue_paid_telegram
after update of status on public.orders
for each row when (old.status is distinct from 'paid' and new.status = 'paid')
execute function public.commerce_queue_paid_telegram();

-- A pending row can be claimed once. An ambiguous network outcome is never
-- automatically reclaimed: Telegram sendMessage has no idempotency key.
create function public.commerce_claim_paid_telegram(p_worker uuid, p_session text default null)
returns public.owner_telegram_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_job public.owner_telegram_outbox;
begin
  select j.* into v_job from public.owner_telegram_outbox j
  join public.orders o on o.id = j.order_id
  where j.status = 'pending' and j.attempts < 3 and o.status = 'paid'
    and (p_session is null or o.stripe_checkout_session_id = p_session)
  order by j.created_at for update of j skip locked limit 1;
  if not found then return null; end if;
  update public.owner_telegram_outbox
  set status = 'sending', attempts = attempts + 1,
    worker_id = p_worker, updated_at = now()
  where id = v_job.id returning * into v_job;
  return v_job;
end $$;

create function public.commerce_finish_paid_telegram(
  p_job uuid, p_worker uuid, p_result text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_result not in ('sent', 'retry', 'uncertain') then
    raise exception 'invalid_telegram_result' using errcode = '22023';
  end if;
  update public.owner_telegram_outbox set
    status = case when p_result = 'sent' then 'sent'
      when p_result = 'uncertain' then 'uncertain'
      when attempts >= 3 then 'failed' else 'pending' end,
    sent_at = case when p_result = 'sent' then now() else sent_at end,
    worker_id = null, updated_at = now()
  where id = p_job and worker_id = p_worker and status = 'sending';
  if not found then raise exception 'telegram_claim_conflict'; end if;
end $$;

revoke all on function public.commerce_queue_paid_telegram() from public, anon, authenticated;
revoke all on function public.commerce_claim_paid_telegram(uuid, text) from public, anon, authenticated;
revoke all on function public.commerce_finish_paid_telegram(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.commerce_claim_paid_telegram(uuid, text) to service_role;
grant execute on function public.commerce_finish_paid_telegram(uuid, uuid, text) to service_role;
