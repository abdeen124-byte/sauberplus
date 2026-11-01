alter table public.partner_transactions
  alter column payment_method drop not null;

alter table public.partner_transactions
  drop constraint if exists partner_transactions_amount_cents_check;

alter table public.partner_transactions
  add constraint partner_transactions_amount_cents_check check (
    amount_cents between 0 and 999999999999
    and (amount_cents > 0 or transaction_type = 'opening_contribution')
  );

alter table public.partner_transactions
  drop constraint if exists partner_transactions_payment_method_check;

do $$
begin
  if exists (select 1 from public.partner_transactions where transaction_type = 'opening_contribution' and payment_method is not null and payment_method <> 'unknown') then
    raise exception using errcode = '55000', message = 'Opening transactions contain a real payment method and require manual review.';
  end if;
  update public.partner_transactions set payment_method = null where transaction_type = 'opening_contribution';
end;
$$;

alter table public.partner_transactions
  add constraint partner_transactions_payment_method_check check (
    (transaction_type = 'opening_contribution' and payment_method is null)
    or (transaction_type <> 'opening_contribution' and payment_method in ('bank_transfer', 'cash', 'card', 'direct_debit', 'other', 'unknown'))
  );

create unique index if not exists partner_transactions_one_opening_idx
  on public.partner_transactions (partner_id)
  where transaction_type = 'opening_contribution' and reverses_transaction_id is null;

create or replace function public.set_partner_opening_balance(
  p_partner_id uuid,
  p_amount_cents bigint,
  p_note text default 'Opening balance'
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid := (select auth.uid());
  v_existing public.partner_transactions%rowtype;
  v_transaction public.partner_transactions%rowtype;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  if p_partner_id is null or p_amount_cents not between 0 and 999999999999 or char_length(coalesce(p_note, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Invalid opening balance.';
  end if;
  if not exists (select 1 from public.partner_financial_profiles where id = p_partner_id and active) then
    raise exception using errcode = 'P0002', message = 'Partner not found.';
  end if;

  perform 1 from public.partner_financial_profiles where id = p_partner_id and active for update;

  select * into v_existing
  from public.partner_transactions
  where partner_id = p_partner_id
    and transaction_type = 'opening_contribution'
    and reverses_transaction_id is null
  for share;

  if found then
    if v_existing.amount_cents <> p_amount_cents then
      raise exception using errcode = '55000', message = 'Opening balance already exists; use a controlled correction.';
    end if;
    return jsonb_build_object('partner_id', p_partner_id, 'amount_cents', v_existing.amount_cents, 'transaction_id', v_existing.id, 'created_at', v_existing.created_at, 'created_by', v_existing.created_by, 'idempotent', true);
  end if;

  insert into public.partner_transactions(
    partner_id, transaction_type, amount_cents, transaction_date, date_precision, payment_method, note, created_by
  ) values (
    p_partner_id, 'opening_contribution', p_amount_cents, null, 'unknown_opening', null, coalesce(p_note, 'Opening balance'), v_actor
  ) returning * into v_transaction;

  insert into public.activity_log(actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'opening_balance_set', 'partner_transactions', v_transaction.id::text,
    jsonb_build_object('partner_id', p_partner_id, 'amount_cents', p_amount_cents, 'transaction_type', 'opening_contribution'));

  return jsonb_build_object('partner_id', p_partner_id, 'amount_cents', v_transaction.amount_cents, 'transaction_id', v_transaction.id, 'created_at', v_transaction.created_at, 'created_by', v_transaction.created_by, 'idempotent', false);
end;
$$;

revoke all on function public.set_partner_opening_balance(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.set_partner_opening_balance(uuid, bigint, text) to authenticated;
