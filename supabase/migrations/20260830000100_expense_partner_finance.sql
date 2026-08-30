begin;

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]{2,50}$'),
  label_de text not null check (char_length(btrim(label_de)) between 1 and 100),
  label_ar text not null check (char_length(btrim(label_ar)) between 1 and 100),
  is_custom boolean not null default false,
  active boolean not null default true,
  position smallint not null check (position between 1 and 999),
  created_by uuid references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_financial_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique check (char_length(btrim(display_name)) between 1 and 160),
  user_profile_id uuid unique references public.user_profiles (id) on delete restrict,
  target_cents bigint check (target_cents is null or target_cents between 0 and 999999999999),
  currency text not null default 'EUR' check (currency = 'EUR'),
  active boolean not null default true,
  created_by uuid not null references public.user_profiles (id),
  updated_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_number_sequences (
  sequence_year smallint primary key check (sequence_year between 2000 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid,
  storage_path text not null unique check (char_length(storage_path) between 1 and 500),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'attached', 'abandoned')),
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'unavailable', 'failed', 'reviewed_ai', 'manual')),
  extraction_confidence smallint check (extraction_confidence is null or extraction_confidence between 0 and 100),
  extraction_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction_summary) = 'object'),
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  attached_at timestamptz
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_number text not null unique check (expense_number ~ '^EXP-[0-9]{4}-[0-9]{4,}$'),
  sequence_year smallint not null check (sequence_year between 2000 and 9999),
  sequence_number integer not null check (sequence_number > 0),
  supplier_name text not null check (char_length(btrim(supplier_name)) between 1 and 180),
  supplier_document_number text check (supplier_document_number is null or char_length(supplier_document_number) <= 120),
  expense_date date not null,
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  custom_category text check (custom_category is null or char_length(btrim(custom_category)) between 1 and 100),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  subtotal_cents bigint not null check (subtotal_cents between 0 and 999999999999),
  tax_cents bigint not null check (tax_cents between 0 and 999999999999),
  total_cents bigint not null check (total_cents between 1 and 999999999999),
  tax_rate_bps integer check (tax_rate_bps is null or tax_rate_bps in (0, 700, 1900)),
  tax_breakdown jsonb not null default '[]'::jsonb check (jsonb_typeof(tax_breakdown) = 'array'),
  currency text not null default 'EUR' check (currency = 'EUR'),
  payment_method text not null check (payment_method in ('bank_transfer', 'cash', 'card', 'direct_debit', 'other', 'unknown')),
  paid_by_type text not null check (paid_by_type in ('company_account', 'cash', 'partner', 'other')),
  paid_by_partner_id uuid references public.partner_financial_profiles (id) on delete restrict,
  status text not null default 'paid' check (status in ('draft', 'reviewed', 'paid', 'cancelled')),
  extraction_status text not null check (extraction_status in ('manual', 'reviewed_ai')),
  extraction_confidence smallint check (extraction_confidence is null or extraction_confidence between 0 and 100),
  duplicate_confirmed boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 2000),
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  cancelled_at timestamptz,
  created_by uuid not null references public.user_profiles (id),
  updated_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_year, sequence_number),
  constraint expenses_totals_check check (total_cents = subtotal_cents + tax_cents),
  constraint expenses_partner_payer_check check (
    (paid_by_type = 'partner' and paid_by_partner_id is not null)
    or (paid_by_type <> 'partner' and paid_by_partner_id is null)
  ),
  constraint expenses_cancelled_state_check check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status <> 'cancelled' and cancelled_at is null)
  )
);

alter table public.expense_receipts
  add constraint expense_receipts_expense_fk foreign key (expense_id) references public.expenses (id) on delete restrict;

create table public.partner_transactions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_financial_profiles (id) on delete restrict,
  transaction_type text not null check (transaction_type in ('opening_contribution', 'contribution', 'expense_advance', 'reimbursement', 'adjustment', 'reversal')),
  amount_cents bigint not null check (amount_cents between 1 and 999999999999),
  transaction_date date,
  date_precision text not null default 'exact' check (date_precision in ('exact', 'unknown_opening')),
  payment_method text not null check (payment_method in ('bank_transfer', 'cash', 'card', 'direct_debit', 'other', 'unknown')),
  related_expense_id uuid references public.expenses (id) on delete restrict,
  proof_receipt_id uuid references public.expense_receipts (id) on delete restrict,
  reverses_transaction_id uuid unique references public.partner_transactions (id) on delete restrict,
  note text not null default '' check (char_length(note) <= 1000),
  created_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  constraint partner_transactions_date_check check (
    (date_precision = 'exact' and transaction_date is not null)
    or (date_precision = 'unknown_opening' and transaction_type = 'opening_contribution' and transaction_date is null)
  ),
  constraint partner_transactions_relation_check check (
    (transaction_type in ('expense_advance', 'reimbursement') and related_expense_id is not null)
    or (transaction_type not in ('expense_advance', 'reimbursement') and related_expense_id is null)
  )
);

create index expenses_date_idx on public.expenses (expense_date desc);
create index expenses_status_idx on public.expenses (status, expense_date desc);
create index expenses_supplier_idx on public.expenses (lower(supplier_name));
create index expense_receipts_sha_idx on public.expense_receipts (sha256);
create index partner_transactions_partner_idx on public.partner_transactions (partner_id, created_at desc);
create index partner_transactions_expense_idx on public.partner_transactions (related_expense_id) where related_expense_id is not null;

insert into public.expense_categories (code, label_de, label_ar, position)
values
  ('cleaning_supplies', 'Reinigungsmittel', 'مواد التنظيف', 10),
  ('work_materials', 'Arbeitsmaterial', 'مواد العمل', 20),
  ('vehicles_fuel', 'Fahrzeuge / Kraftstoff', 'المركبات / الوقود', 30),
  ('tools', 'Werkzeug', 'أدوات', 40),
  ('workwear', 'Arbeitskleidung', 'ملابس العمل', 50),
  ('office', 'Büro', 'المكتب', 60),
  ('advertising', 'Werbung', 'الإعلان', 70),
  ('software_subscriptions', 'Software / Abos', 'البرامج / الاشتراكات', 80),
  ('phone_internet', 'Telefon / Internet', 'الهاتف / الإنترنت', 90),
  ('insurance', 'Versicherung', 'التأمين', 100),
  ('rent_rooms', 'Miete / Räume', 'الإيجار / المقر', 110),
  ('training', 'Weiterbildung', 'التدريب', 120),
  ('other', 'Sonstige', 'أخرى', 130);

create trigger expense_categories_touch_updated_at before update on public.expense_categories
for each row execute function public.trg_touch_updated_at();
create trigger partner_financial_profiles_touch_updated_at before update on public.partner_financial_profiles
for each row execute function public.trg_touch_updated_at();
create trigger expenses_touch_updated_at before update on public.expenses
for each row execute function public.trg_touch_updated_at();

create or replace function public.trg_protect_partner_transactions()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception using errcode = '55000', message = 'Finalized partner transactions are immutable; use a correction or reversal.';
end;
$$;
revoke execute on function public.trg_protect_partner_transactions() from public, anon, authenticated;
create trigger partner_transactions_immutable before update or delete on public.partner_transactions
for each row execute function public.trg_protect_partner_transactions();

create or replace function public.trg_protect_expense_history()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'Expenses cannot be deleted.';
  end if;
  if old.status <> 'draft' and (
    new.expense_number is distinct from old.expense_number
    or new.sequence_year is distinct from old.sequence_year
    or new.sequence_number is distinct from old.sequence_number
    or new.supplier_name is distinct from old.supplier_name
    or new.supplier_document_number is distinct from old.supplier_document_number
    or new.expense_date is distinct from old.expense_date
    or new.category_id is distinct from old.category_id
    or new.custom_category is distinct from old.custom_category
    or new.description is distinct from old.description
    or new.subtotal_cents is distinct from old.subtotal_cents
    or new.tax_cents is distinct from old.tax_cents
    or new.total_cents is distinct from old.total_cents
    or new.tax_rate_bps is distinct from old.tax_rate_bps
    or new.tax_breakdown is distinct from old.tax_breakdown
    or new.currency is distinct from old.currency
    or new.payment_method is distinct from old.payment_method
    or new.paid_by_type is distinct from old.paid_by_type
    or new.paid_by_partner_id is distinct from old.paid_by_partner_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '55000', message = 'Reviewed expense identity and financial values are immutable.';
  end if;
  if (old.status in ('reviewed', 'paid') and new.status not in (old.status, 'cancelled'))
    or (old.status = 'cancelled' and new.status <> 'cancelled') then
    raise exception using errcode = '55000', message = 'Invalid expense status transition.';
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_protect_expense_history() from public, anon, authenticated;
create trigger expenses_protect_history before update or delete on public.expenses
for each row execute function public.trg_protect_expense_history();

create or replace function public.validate_expense_tax_breakdown(
  p_breakdown jsonb, p_subtotal bigint, p_tax bigint, p_total bigint
) returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare v_row jsonb; v_net bigint := 0; v_tax bigint := 0; v_gross bigint := 0; v_rate integer; v_row_net bigint; v_row_tax bigint; v_row_gross bigint; v_denominator bigint;
begin
  if jsonb_typeof(p_breakdown) <> 'array' then raise exception using errcode='22023', message='Tax breakdown must be an array.'; end if;
  if jsonb_array_length(p_breakdown) = 0 then return; end if;
  if jsonb_array_length(p_breakdown) > 8 then raise exception using errcode='22023', message='Too many tax rows.'; end if;
  for v_row in select value from jsonb_array_elements(p_breakdown) loop
    if coalesce(v_row->>'rate_bps','') !~ '^(0|700|1900)$'
      or coalesce(v_row->>'net_cents','') !~ '^\d{1,12}$'
      or coalesce(v_row->>'tax_cents','') !~ '^\d{1,12}$'
      or coalesce(v_row->>'gross_cents','') !~ '^\d{1,12}$' then
      raise exception using errcode='22023', message='Invalid tax row.';
    end if;
    v_rate := (v_row->>'rate_bps')::integer; v_row_net := (v_row->>'net_cents')::bigint; v_row_tax := (v_row->>'tax_cents')::bigint; v_row_gross := (v_row->>'gross_cents')::bigint;
    if v_row_gross <> v_row_net + v_row_tax then
      raise exception using errcode='22023', message='Tax row totals do not balance.';
    end if;
    v_denominator := 10000 + v_rate;
    if v_row_net <> (v_row_gross * 10000 + (v_denominator / 2)) / v_denominator or v_row_tax <> v_row_gross - v_row_net then
      raise exception using errcode='22023', message='Tax row does not match its declared rate.';
    end if;
    v_net := v_net + v_row_net; v_tax := v_tax + v_row_tax; v_gross := v_gross + v_row_gross;
  end loop;
  if v_net <> p_subtotal or v_tax <> p_tax or v_gross <> p_total then
    raise exception using errcode='22023', message='Tax breakdown does not match expense totals.';
  end if;
end;
$$;
revoke all on function public.validate_expense_tax_breakdown(jsonb,bigint,bigint,bigint) from public, anon, authenticated;

create or replace function public.begin_expense_receipt(
  p_original_filename text, p_mime_type text, p_size_bytes integer, p_sha256 text
) returns public.expense_receipts language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid := (select auth.uid()); v_receipt public.expense_receipts%rowtype; v_extension text;
begin
  if not public.is_super_admin() then raise exception using errcode='42501', message='Super Admin access is required.'; end if;
  if char_length(btrim(coalesce(p_original_filename,''))) not between 1 and 255
    or p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf')
    or p_size_bytes not between 1 and 10485760
    or coalesce(p_sha256,'') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023', message='Invalid receipt metadata.';
  end if;
  v_extension := case p_mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'pdf' end;
  v_receipt.id := gen_random_uuid();
  v_receipt.storage_path := 'receipts/' || v_receipt.id::text || '/original.' || v_extension;
  insert into public.expense_receipts (id, storage_path, original_filename, mime_type, size_bytes, sha256, created_by)
  values (v_receipt.id, v_receipt.storage_path, btrim(p_original_filename), p_mime_type, p_size_bytes, p_sha256, v_actor)
  returning * into v_receipt;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'receipt_begin','expense_receipts',v_receipt.id::text,
    jsonb_build_object('mime_type',p_mime_type,'size_bytes',p_size_bytes,'sha256',p_sha256));
  return v_receipt;
end;
$$;

create or replace function public.expense_receipt_path_is_allowed(p_name text)
returns boolean language sql security definer set search_path = public, pg_temp stable as $$
  select public.is_super_admin() and exists (
    select 1 from public.expense_receipts r where r.storage_path = p_name and (r.status='attached' or (r.status='pending' and r.created_by=(select auth.uid())))
  );
$$;

create or replace function public.find_expense_duplicates(
  p_supplier text, p_document_number text, p_expense_date date, p_total_cents bigint, p_sha256 text default null
) returns table(id uuid, expense_number text, supplier_name text, expense_date date, total_cents bigint, match_reason text)
language sql security definer set search_path = public, pg_temp stable as $$
  select distinct e.id, e.expense_number, e.supplier_name, e.expense_date, e.total_cents,
    case
      when p_sha256 is not null and r.sha256 = p_sha256 then 'checksum'
      when nullif(btrim(coalesce(p_document_number,'')),'') is not null and lower(e.supplier_name)=lower(btrim(p_supplier)) and lower(coalesce(e.supplier_document_number,''))=lower(btrim(p_document_number)) then 'document_number'
      else 'supplier_date_amount'
    end
  from public.expenses e
  left join public.expense_receipts r on r.expense_id=e.id
  where public.is_super_admin() and e.status <> 'cancelled' and (
    (p_sha256 is not null and r.sha256=p_sha256)
    or (nullif(btrim(coalesce(p_document_number,'')),'') is not null and lower(e.supplier_name)=lower(btrim(p_supplier)) and lower(coalesce(e.supplier_document_number,''))=lower(btrim(p_document_number)))
    or (lower(e.supplier_name)=lower(btrim(p_supplier)) and e.expense_date=p_expense_date and e.total_cents=p_total_cents)
  ) limit 10;
$$;

create or replace function public.save_expense(p_expense jsonb, p_receipt_id uuid default null)
returns public.expenses language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := (select auth.uid()); v_expense public.expenses%rowtype; v_receipt public.expense_receipts%rowtype;
  v_year smallint; v_sequence integer; v_subtotal bigint; v_tax bigint; v_total bigint; v_partner uuid;
  v_breakdown jsonb := coalesce(p_expense->'tax_breakdown','[]'::jsonb); v_status text := coalesce(p_expense->>'status','paid');
begin
  if not public.is_super_admin() then raise exception using errcode='42501', message='Super Admin access is required.'; end if;
  if jsonb_typeof(p_expense) <> 'object' or octet_length(p_expense::text)>30000 then raise exception using errcode='22023', message='Invalid expense payload.'; end if;
  if coalesce(p_expense->>'subtotal_cents','') !~ '^\d{1,12}$' or coalesce(p_expense->>'tax_cents','') !~ '^\d{1,12}$'
    or coalesce(p_expense->>'total_cents','') !~ '^\d{1,12}$' or coalesce(p_expense->>'expense_date','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode='22023', message='Invalid expense amounts or date.';
  end if;
  v_subtotal := (p_expense->>'subtotal_cents')::bigint; v_tax := (p_expense->>'tax_cents')::bigint; v_total := (p_expense->>'total_cents')::bigint;
  if v_total<=0 or v_total<>v_subtotal+v_tax then raise exception using errcode='22023', message='Expense totals do not balance.'; end if;
  perform public.validate_expense_tax_breakdown(v_breakdown,v_subtotal,v_tax,v_total);
  if jsonb_array_length(v_breakdown)=0 then
    if coalesce(p_expense->>'tax_rate_bps','')!~'^(0|700|1900)$'
      or v_subtotal <> (v_total * 10000 + ((10000 + (p_expense->>'tax_rate_bps')::integer) / 2)) / (10000 + (p_expense->>'tax_rate_bps')::integer)
      or v_tax <> v_total-v_subtotal then
      raise exception using errcode='22023',message='Expense totals do not match the declared tax rate.';
    end if;
  elsif coalesce(p_expense->>'tax_rate_bps','')<>'' then
    raise exception using errcode='22023',message='Mixed tax expenses must not declare one tax rate.';
  end if;
  if char_length(btrim(coalesce(p_expense->>'supplier_name',''))) not between 1 and 180
    or char_length(btrim(coalesce(p_expense->>'description',''))) not between 1 and 500
    or coalesce(p_expense->>'payment_method','') not in ('bank_transfer','cash','card','direct_debit','other','unknown')
    or coalesce(p_expense->>'paid_by_type','') not in ('company_account','cash','partner','other')
    or coalesce(p_expense->>'extraction_status','') not in ('manual','reviewed_ai')
    or v_status not in ('draft','reviewed','paid') then
    raise exception using errcode='22023', message='Expense review fields are invalid.';
  end if;
  if coalesce(p_expense->>'category_id','') !~ '^[0-9a-f-]{36}$' or not exists(select 1 from public.expense_categories where id=(p_expense->>'category_id')::uuid and active) then
    raise exception using errcode='22023', message='Expense category is invalid.';
  end if;
  if p_expense->>'paid_by_type'='partner' then
    if coalesce(p_expense->>'paid_by_partner_id','') !~ '^[0-9a-f-]{36}$' then raise exception using errcode='22023', message='Paying partner is required.'; end if;
    v_partner := (p_expense->>'paid_by_partner_id')::uuid;
    if not exists(select 1 from public.partner_financial_profiles where id=v_partner and active) then raise exception using errcode='22023', message='Paying partner is invalid.'; end if;
  end if;
  if p_receipt_id is not null then
    select * into v_receipt from public.expense_receipts where id=p_receipt_id for update;
    if not found or v_receipt.created_by<>v_actor or v_receipt.status<>'pending' or v_receipt.expense_id is not null then
      raise exception using errcode='55000', message='Receipt is not available for this expense.';
    end if;
  end if;
  v_year := extract(year from (p_expense->>'expense_date')::date)::smallint;
  insert into public.expense_number_sequences(sequence_year,last_number) values(v_year,1)
  on conflict(sequence_year) do update set last_number=public.expense_number_sequences.last_number+1,updated_at=clock_timestamp()
  returning last_number into v_sequence;
  insert into public.expenses(
    expense_number,sequence_year,sequence_number,supplier_name,supplier_document_number,expense_date,category_id,custom_category,description,
    subtotal_cents,tax_cents,total_cents,tax_rate_bps,tax_breakdown,payment_method,paid_by_type,paid_by_partner_id,status,
    extraction_status,extraction_confidence,duplicate_confirmed,notes,created_by,updated_by
  ) values(
    'EXP-'||v_year::text||'-'||lpad(v_sequence::text,4,'0'),v_year,v_sequence,btrim(p_expense->>'supplier_name'),
    nullif(btrim(coalesce(p_expense->>'supplier_document_number','')),''),(p_expense->>'expense_date')::date,(p_expense->>'category_id')::uuid,
    nullif(btrim(coalesce(p_expense->>'custom_category','')),''),btrim(p_expense->>'description'),v_subtotal,v_tax,v_total,
    case when coalesce(p_expense->>'tax_rate_bps','')~'^(0|700|1900)$' then (p_expense->>'tax_rate_bps')::integer else null end,
    v_breakdown,p_expense->>'payment_method',p_expense->>'paid_by_type',v_partner,v_status,p_expense->>'extraction_status',
    case when coalesce(p_expense->>'extraction_confidence','')~'^\d{1,3}$' then (p_expense->>'extraction_confidence')::smallint else null end,
    coalesce((p_expense->>'duplicate_confirmed')::boolean,false),coalesce(p_expense->>'notes',''),v_actor,v_actor
  ) returning * into v_expense;
  if p_receipt_id is not null then
    update public.expense_receipts set expense_id=v_expense.id,status='attached',attached_at=clock_timestamp(),
      extraction_status=p_expense->>'extraction_status',extraction_confidence=v_expense.extraction_confidence,
      extraction_summary=jsonb_build_object('supplier_name',v_expense.supplier_name,'expense_date',v_expense.expense_date,'total_cents',v_total,'category_id',v_expense.category_id)
    where id=p_receipt_id;
  end if;
  if v_partner is not null and v_status <> 'draft' then
    insert into public.partner_transactions(partner_id,transaction_type,amount_cents,transaction_date,payment_method,related_expense_id,note,created_by)
    values(v_partner,'expense_advance',v_total,v_expense.expense_date,v_expense.payment_method,v_expense.id,'',v_actor);
  end if;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'create','expenses',v_expense.id::text,
    jsonb_build_object('expense_number',v_expense.expense_number,'total_cents',v_total,'paid_by_type',v_expense.paid_by_type,'receipt_attached',p_receipt_id is not null));
  return v_expense;
end;
$$;

create or replace function public.finalize_expense_draft(p_expense_id uuid,p_status text)
returns public.expenses language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=(select auth.uid()); v_expense public.expenses%rowtype;
begin
  if not public.is_super_admin() then raise exception using errcode='42501',message='Super Admin access is required.'; end if;
  if p_status not in ('reviewed','paid') then raise exception using errcode='22023',message='Invalid final expense status.'; end if;
  select * into v_expense from public.expenses where id=p_expense_id for update;
  if not found then raise exception using errcode='P0002',message='Expense not found.'; end if;
  if v_expense.status<>'draft' then raise exception using errcode='55000',message='Only a draft can be finalized.'; end if;
  update public.expenses set status=p_status,updated_by=v_actor where id=p_expense_id returning * into v_expense;
  if v_expense.paid_by_type='partner' and not exists(select 1 from public.partner_transactions where related_expense_id=v_expense.id and transaction_type='expense_advance') then
    insert into public.partner_transactions(partner_id,transaction_type,amount_cents,transaction_date,payment_method,related_expense_id,note,created_by)
    values(v_expense.paid_by_partner_id,'expense_advance',v_expense.total_cents,v_expense.expense_date,v_expense.payment_method,v_expense.id,'',v_actor);
  end if;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'finalize','expenses',v_expense.id::text,jsonb_build_object('expense_number',v_expense.expense_number,'status',p_status));
  return v_expense;
end;
$$;

create or replace function public.cancel_expense(p_expense_id uuid,p_reason text default null)
returns public.expenses language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=(select auth.uid()); v_expense public.expenses%rowtype; v_advance public.partner_transactions%rowtype;
begin
  if not public.is_super_admin() then raise exception using errcode='42501',message='Super Admin access is required.'; end if;
  select * into v_expense from public.expenses where id=p_expense_id for update;
  if not found then raise exception using errcode='P0002',message='Expense not found.'; end if;
  if v_expense.status='cancelled' then return v_expense; end if;
  select * into v_advance from public.partner_transactions where related_expense_id=p_expense_id and transaction_type='expense_advance';
  if found and exists(select 1 from public.partner_transactions r where r.related_expense_id=p_expense_id and r.transaction_type='reimbursement' and not exists(select 1 from public.partner_transactions x where x.reverses_transaction_id=r.id)) then
    raise exception using errcode='55000',message='Reimbursed partner expenses require a controlled correction.';
  end if;
  update public.expenses set status='cancelled',cancelled_at=clock_timestamp(),cancellation_reason=nullif(btrim(coalesce(p_reason,'')),''),updated_by=v_actor
  where id=p_expense_id returning * into v_expense;
  if v_advance.id is not null then
    insert into public.partner_transactions(partner_id,transaction_type,amount_cents,transaction_date,payment_method,reverses_transaction_id,note,created_by)
    values(v_advance.partner_id,'reversal',v_advance.amount_cents,current_date,'unknown',v_advance.id,'Expense cancelled',v_actor);
  end if;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'cancel','expenses',v_expense.id::text,jsonb_build_object('expense_number',v_expense.expense_number));
  return v_expense;
end;
$$;

create or replace function public.add_partner_contribution(
  p_partner_id uuid,p_amount_cents bigint,p_date date,p_payment_method text,p_note text default '',p_proof_receipt_id uuid default null
) returns public.partner_transactions language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=(select auth.uid()); v_tx public.partner_transactions%rowtype;
begin
  if not public.is_super_admin() then raise exception using errcode='42501',message='Super Admin access is required.'; end if;
  if p_amount_cents not between 1 and 999999999999 or p_date is null or p_payment_method not in ('bank_transfer','cash','card','direct_debit','other','unknown') or char_length(coalesce(p_note,''))>1000
    or not exists(select 1 from public.partner_financial_profiles where id=p_partner_id and active) then
    raise exception using errcode='22023',message='Invalid contribution.';
  end if;
  if p_proof_receipt_id is not null and not exists(select 1 from public.expense_receipts where id=p_proof_receipt_id and created_by=v_actor and status='pending') then
    raise exception using errcode='55000',message='Proof receipt is unavailable.';
  end if;
  insert into public.partner_transactions(partner_id,transaction_type,amount_cents,transaction_date,payment_method,proof_receipt_id,note,created_by)
  values(p_partner_id,'contribution',p_amount_cents,p_date,p_payment_method,p_proof_receipt_id,coalesce(p_note,''),v_actor) returning * into v_tx;
  if p_proof_receipt_id is not null then update public.expense_receipts set status='attached',attached_at=clock_timestamp() where id=p_proof_receipt_id; end if;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'contribution','partner_transactions',v_tx.id::text,jsonb_build_object('partner_id',p_partner_id,'amount_cents',p_amount_cents));
  return v_tx;
end;
$$;

create or replace function public.reimburse_partner_expense(
  p_expense_id uuid,p_amount_cents bigint,p_date date,p_payment_method text,p_note text default '',p_proof_receipt_id uuid default null
) returns public.partner_transactions language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=(select auth.uid()); v_expense public.expenses%rowtype; v_advance public.partner_transactions%rowtype; v_paid bigint; v_tx public.partner_transactions%rowtype;
begin
  if not public.is_super_admin() then raise exception using errcode='42501',message='Super Admin access is required.'; end if;
  select * into v_expense from public.expenses where id=p_expense_id and status<>'cancelled' for update;
  if not found then raise exception using errcode='P0002',message='Expense not found.'; end if;
  select * into v_advance from public.partner_transactions where related_expense_id=p_expense_id and transaction_type='expense_advance';
  if not found then raise exception using errcode='55000',message='Expense is not a partner advance.'; end if;
  select coalesce(sum(r.amount_cents),0)-coalesce(sum(x.amount_cents),0) into v_paid
  from public.partner_transactions r left join public.partner_transactions x on x.reverses_transaction_id=r.id
  where r.related_expense_id=p_expense_id and r.transaction_type='reimbursement';
  if p_amount_cents<=0 or p_amount_cents>v_advance.amount_cents-v_paid or p_date is null or p_payment_method not in ('bank_transfer','cash','card','direct_debit','other') then
    raise exception using errcode='22023',message='Invalid reimbursement amount or payment.';
  end if;
  if p_proof_receipt_id is not null and not exists(select 1 from public.expense_receipts where id=p_proof_receipt_id and created_by=v_actor and status='pending') then
    raise exception using errcode='55000',message='Proof receipt is unavailable.';
  end if;
  insert into public.partner_transactions(partner_id,transaction_type,amount_cents,transaction_date,payment_method,related_expense_id,proof_receipt_id,note,created_by)
  values(v_advance.partner_id,'reimbursement',p_amount_cents,p_date,p_payment_method,p_expense_id,p_proof_receipt_id,coalesce(p_note,''),v_actor) returning * into v_tx;
  if p_proof_receipt_id is not null then update public.expense_receipts set status='attached',attached_at=clock_timestamp() where id=p_proof_receipt_id and created_by=v_actor and status='pending'; end if;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'reimbursement','partner_transactions',v_tx.id::text,jsonb_build_object('expense_id',p_expense_id,'amount_cents',p_amount_cents));
  return v_tx;
end;
$$;

create or replace function public.set_partner_target(p_partner_id uuid,p_target_cents bigint default null)
returns public.partner_financial_profiles language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=(select auth.uid()); v_profile public.partner_financial_profiles%rowtype;
begin
  if not public.is_super_admin() then raise exception using errcode='42501',message='Super Admin access is required.'; end if;
  if p_target_cents is not null and p_target_cents not between 0 and 999999999999 then raise exception using errcode='22023',message='Invalid contribution target.'; end if;
  update public.partner_financial_profiles set target_cents=p_target_cents,updated_by=v_actor where id=p_partner_id returning * into v_profile;
  if not found then raise exception using errcode='P0002',message='Partner not found.'; end if;
  return v_profile;
end;
$$;

create or replace function public.reverse_partner_transaction(p_transaction_id uuid,p_date date,p_note text default '')
returns public.partner_transactions language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=(select auth.uid()); v_source public.partner_transactions%rowtype; v_reversal public.partner_transactions%rowtype;
begin
  if not public.is_super_admin() then raise exception using errcode='42501',message='Super Admin access is required.'; end if;
  select * into v_source from public.partner_transactions where id=p_transaction_id and transaction_type in ('opening_contribution','contribution','adjustment','reimbursement') for share;
  if not found or p_date is null or char_length(coalesce(p_note,''))>1000 then raise exception using errcode='22023',message='Transaction cannot be reversed.'; end if;
  if exists(select 1 from public.partner_transactions where reverses_transaction_id=v_source.id) then raise exception using errcode='55000',message='Transaction is already reversed.'; end if;
  insert into public.partner_transactions(partner_id,transaction_type,amount_cents,transaction_date,payment_method,reverses_transaction_id,note,created_by)
  values(v_source.partner_id,'reversal',v_source.amount_cents,p_date,'unknown',v_source.id,coalesce(p_note,''),v_actor) returning * into v_reversal;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'reversal','partner_transactions',v_reversal.id::text,jsonb_build_object('reverses_transaction_id',v_source.id));
  return v_reversal;
end;
$$;

create or replace function public.partner_financial_summary()
returns table(partner_id uuid,display_name text,target_cents bigint,contribution_cents bigint,advance_cents bigint,reimbursed_cents bigint,open_reimbursement_cents bigint,last_contribution_date date)
language sql security definer set search_path=public,pg_temp stable as $$
  select p.id,p.display_name,p.target_cents,
    coalesce(sum(t.amount_cents) filter(where t.transaction_type in ('opening_contribution','contribution','adjustment')),0)
      - coalesce(sum(t.amount_cents) filter(where t.transaction_type='reversal' and t.reverses_transaction_id in (select id from public.partner_transactions where transaction_type in ('opening_contribution','contribution','adjustment'))),0),
    coalesce(sum(t.amount_cents) filter(where t.transaction_type='expense_advance'),0)
      - coalesce(sum(t.amount_cents) filter(where t.transaction_type='reversal' and t.reverses_transaction_id in (select id from public.partner_transactions where transaction_type='expense_advance')),0),
    coalesce(sum(t.amount_cents) filter(where t.transaction_type='reimbursement'),0)
      - coalesce(sum(t.amount_cents) filter(where t.transaction_type='reversal' and t.reverses_transaction_id in (select id from public.partner_transactions where transaction_type='reimbursement')),0),
    greatest(0,
      coalesce(sum(t.amount_cents) filter(where t.transaction_type='expense_advance'),0)
      - coalesce(sum(t.amount_cents) filter(where t.transaction_type='reimbursement'),0)
      + coalesce(sum(t.amount_cents) filter(where t.transaction_type='reversal' and t.reverses_transaction_id in (select id from public.partner_transactions where transaction_type='reimbursement')),0)
      - coalesce(sum(t.amount_cents) filter(where t.transaction_type='reversal' and t.reverses_transaction_id in (select id from public.partner_transactions where transaction_type='expense_advance')),0)),
    max(t.transaction_date) filter(where t.transaction_type in ('opening_contribution','contribution'))
  from public.partner_financial_profiles p left join public.partner_transactions t on t.partner_id=p.id
  where public.is_super_admin() and p.active group by p.id,p.display_name,p.target_cents order by p.display_name;
$$;

create or replace function public.financial_overview(p_from date,p_to date)
returns jsonb language sql security definer set search_path=public,pg_temp stable as $$
  select case when public.is_super_admin() then jsonb_build_object(
    'income_cents',coalesce((select sum(total_cents) from public.invoices where status='paid' and paid_at::date between p_from and p_to),0),
    'expense_cents',coalesce((select sum(total_cents) from public.expenses where status in ('reviewed','paid') and expense_date between p_from and p_to),0),
    'contribution_cents',coalesce((select sum(amount_cents) from public.partner_transactions where transaction_type='contribution' and transaction_date between p_from and p_to),0)
      - coalesce((select sum(x.amount_cents) from public.partner_transactions x join public.partner_transactions s on s.id=x.reverses_transaction_id and s.transaction_type='contribution' where x.transaction_type='reversal' and x.transaction_date between p_from and p_to),0),
    'open_advance_cents',coalesce((select sum(open_reimbursement_cents) from public.partner_financial_summary()),0),
    'reimbursement_cents',coalesce((select sum(amount_cents) from public.partner_transactions where transaction_type='reimbursement' and transaction_date between p_from and p_to),0)
      - coalesce((select sum(x.amount_cents) from public.partner_transactions x join public.partner_transactions s on s.id=x.reverses_transaction_id and s.transaction_type='reimbursement' where x.transaction_type='reversal' and x.transaction_date between p_from and p_to),0)
  ) else '{}'::jsonb end;
$$;

create or replace function public.bootstrap_partner_finances(p_payload jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_partner jsonb; v_profile uuid; v_count integer:=0;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service role access is required.'; end if;
  if jsonb_typeof(p_payload)<>'object' or jsonb_typeof(p_payload->'partners')<>'array' or jsonb_array_length(p_payload->'partners') not between 1 and 20 then raise exception using errcode='22023',message='Invalid partner bootstrap payload.'; end if;
  if coalesce(p_payload->>'actor_id','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='Invalid bootstrap actor.'; end if;
  v_actor := (p_payload->>'actor_id')::uuid;
  if not exists(select 1 from public.user_profiles where id=v_actor and role='super_admin' and disabled=false and archived_at is null) then raise exception using errcode='42501',message='Bootstrap actor must be an active Super Admin.'; end if;
  if exists(select 1 from public.partner_financial_profiles) then raise exception using errcode='55000',message='Partner finances are already initialized.'; end if;
  for v_partner in select value from jsonb_array_elements(p_payload->'partners') loop
    if char_length(btrim(coalesce(v_partner->>'display_name',''))) not between 1 and 160 or coalesce(v_partner->>'opening_cents','')!~'^\d{1,12}$' then raise exception using errcode='22023',message='Invalid opening partner.'; end if;
    insert into public.partner_financial_profiles(display_name,created_by,updated_by) values(btrim(v_partner->>'display_name'),v_actor,v_actor) returning id into v_profile;
    if (v_partner->>'opening_cents')::bigint>0 then
      insert into public.partner_transactions(partner_id,transaction_type,amount_cents,transaction_date,date_precision,payment_method,note,created_by)
      values(v_profile,'opening_contribution',(v_partner->>'opening_cents')::bigint,null,'unknown_opening','unknown','Eröffnungsbestand / Import',v_actor);
    end if;
    v_count:=v_count+1;
  end loop;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'bootstrap','partner_financial_profiles','opening',jsonb_build_object('partner_count',v_count));
  return v_count;
end;
$$;

revoke all on function public.begin_expense_receipt(text,text,integer,text) from public,anon,authenticated;
revoke all on function public.expense_receipt_path_is_allowed(text) from public,anon,authenticated;
revoke all on function public.find_expense_duplicates(text,text,date,bigint,text) from public,anon,authenticated;
revoke all on function public.save_expense(jsonb,uuid) from public,anon,authenticated;
revoke all on function public.finalize_expense_draft(uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_expense(uuid,text) from public,anon,authenticated;
revoke all on function public.add_partner_contribution(uuid,bigint,date,text,text,uuid) from public,anon,authenticated;
revoke all on function public.reimburse_partner_expense(uuid,bigint,date,text,text,uuid) from public,anon,authenticated;
revoke all on function public.set_partner_target(uuid,bigint) from public,anon,authenticated;
revoke all on function public.reverse_partner_transaction(uuid,date,text) from public,anon,authenticated;
revoke all on function public.partner_financial_summary() from public,anon,authenticated;
revoke all on function public.financial_overview(date,date) from public,anon,authenticated;
revoke all on function public.bootstrap_partner_finances(jsonb) from public,anon,authenticated;

grant execute on function public.begin_expense_receipt(text,text,integer,text) to authenticated;
grant execute on function public.expense_receipt_path_is_allowed(text) to authenticated;
grant execute on function public.find_expense_duplicates(text,text,date,bigint,text) to authenticated;
grant execute on function public.save_expense(jsonb,uuid) to authenticated;
grant execute on function public.finalize_expense_draft(uuid,text) to authenticated;
grant execute on function public.cancel_expense(uuid,text) to authenticated;
grant execute on function public.add_partner_contribution(uuid,bigint,date,text,text,uuid) to authenticated;
grant execute on function public.reimburse_partner_expense(uuid,bigint,date,text,text,uuid) to authenticated;
grant execute on function public.set_partner_target(uuid,bigint) to authenticated;
grant execute on function public.reverse_partner_transaction(uuid,date,text) to authenticated;
grant execute on function public.partner_financial_summary() to authenticated;
grant execute on function public.financial_overview(date,date) to authenticated;
grant execute on function public.bootstrap_partner_finances(jsonb) to service_role;

alter table public.expense_categories enable row level security;
alter table public.partner_financial_profiles enable row level security;
alter table public.expense_number_sequences enable row level security;
alter table public.expense_receipts enable row level security;
alter table public.expenses enable row level security;
alter table public.partner_transactions enable row level security;

revoke all on public.expense_categories,public.partner_financial_profiles,public.expense_number_sequences,public.expense_receipts,public.expenses,public.partner_transactions from public,anon,authenticated;
grant select on public.expense_categories,public.partner_financial_profiles,public.expense_receipts,public.expenses,public.partner_transactions to authenticated;

create policy expense_categories_super_admin_read on public.expense_categories for select to authenticated using(public.is_super_admin());
create policy partner_financial_profiles_super_admin_read on public.partner_financial_profiles for select to authenticated using(public.is_super_admin());
create policy expense_receipts_super_admin_read on public.expense_receipts for select to authenticated using(public.is_super_admin());
create policy expenses_super_admin_read on public.expenses for select to authenticated using(public.is_super_admin());
create policy partner_transactions_super_admin_read on public.partner_transactions for select to authenticated using(public.is_super_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expense-receipts','expense-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy expense_receipts_super_admin_read_storage on storage.objects for select to authenticated
using(bucket_id='expense-receipts' and public.expense_receipt_path_is_allowed(name));
create policy expense_receipts_super_admin_insert_storage on storage.objects for insert to authenticated
with check(bucket_id='expense-receipts' and public.expense_receipt_path_is_allowed(name));

commit;
