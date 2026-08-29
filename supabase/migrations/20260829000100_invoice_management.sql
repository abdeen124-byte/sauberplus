begin;

create table public.invoice_customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  salutation text check (salutation is null or char_length(salutation) <= 50),
  company_name text check (company_name is null or char_length(company_name) <= 160),
  first_name text check (first_name is null or char_length(first_name) <= 120),
  last_name text check (last_name is null or char_length(last_name) <= 120),
  street_address text not null default '' check (char_length(street_address) <= 300),
  postal_code text not null default '' check (char_length(postal_code) <= 20),
  city text not null default '' check (char_length(city) <= 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 50),
  archived_at timestamptz,
  created_by uuid not null references public.user_profiles (id),
  updated_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_customers_active_name_idx
on public.invoice_customers (lower(display_name))
where archived_at is null;

create table public.invoice_settings (
  singleton boolean primary key default true check (singleton),
  legal_name text not null default '' check (char_length(legal_name) <= 180),
  street_address text not null default '' check (char_length(street_address) <= 300),
  postal_code text not null default '' check (char_length(postal_code) <= 20),
  city text not null default '' check (char_length(city) <= 120),
  phone text not null default '' check (char_length(phone) <= 50),
  email text not null default '' check (char_length(email) <= 254),
  website text not null default '' check (char_length(website) <= 200),
  tax_number text not null default '' check (char_length(tax_number) <= 80),
  account_holder text not null default '' check (char_length(account_holder) <= 180),
  iban text not null default '' check (char_length(iban) <= 42),
  default_vat_bps integer not null default 1900 check (default_vat_bps between 0 and 10000),
  default_payment_terms text not null default 'zahlbar nach Erhalt' check (char_length(default_payment_terms) between 1 and 160),
  invoice_prefix text not null default 'SP' check (invoice_prefix = 'SP'),
  updated_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_number_sequences (
  sequence_year smallint primary key check (sequence_year between 2000 and 9999),
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique check (invoice_number is null or invoice_number ~ '^SP-[0-9]{4}-[0-9]{4,}$'),
  sequence_year smallint check (sequence_year is null or sequence_year between 2000 and 9999),
  sequence_number integer check (sequence_number is null or sequence_number > 0),
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'cancelled')),
  pricing_mode text not null default 'gross' check (pricing_mode in ('gross', 'net')),
  customer_id uuid references public.invoice_customers (id) on delete restrict,
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  issuer_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(issuer_snapshot) = 'object'),
  invoice_date date not null default current_date,
  service_date date not null,
  payment_terms text not null check (char_length(payment_terms) between 1 and 160),
  payment_method text not null check (payment_method in ('bank_transfer', 'cash')),
  subtotal_cents bigint not null default 0 check (subtotal_cents between 0 and 999999999999),
  vat_bps integer not null default 1900 check (vat_bps between 0 and 10000),
  vat_cents bigint not null default 0 check (vat_cents between 0 and 999999999999),
  total_cents bigint not null default 0 check (total_cents between 0 and 999999999999),
  notes text not null default '' check (char_length(notes) <= 2000),
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 1000),
  pdf_storage_path text check (pdf_storage_path is null or char_length(pdf_storage_path) <= 500),
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_generated_at timestamptz,
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.user_profiles (id),
  updated_by uuid not null references public.user_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_year, sequence_number),
  constraint invoices_totals_check check (total_cents = subtotal_cents + vat_cents),
  constraint invoices_pdf_metadata_check check (
    (pdf_storage_path is null and pdf_sha256 is null and pdf_generated_at is null)
    or (pdf_storage_path is not null and pdf_sha256 is not null and pdf_generated_at is not null)
  ),
  constraint invoices_snapshot_state_check check (
    status = 'draft'
    or (
      btrim(coalesce(customer_snapshot ->> 'display_name', '')) <> ''
      and btrim(coalesce(customer_snapshot ->> 'street_address', '')) <> ''
      and btrim(coalesce(issuer_snapshot ->> 'legal_name', '')) <> ''
      and btrim(coalesce(issuer_snapshot ->> 'tax_number', '')) <> ''
      and btrim(coalesce(issuer_snapshot ->> 'iban', '')) <> ''
    )
  ),
  constraint invoices_number_state_check check (
    (status = 'draft' and invoice_number is null and sequence_year is null and sequence_number is null and issued_at is null and paid_at is null and cancelled_at is null)
    or
    (status = 'open' and invoice_number is not null and sequence_year is not null and sequence_number is not null and issued_at is not null and paid_at is null and cancelled_at is null)
    or
    (status = 'paid' and invoice_number is not null and sequence_year is not null and sequence_number is not null and issued_at is not null and paid_at is not null and cancelled_at is null)
    or
    (status = 'cancelled' and invoice_number is not null and sequence_year is not null and sequence_number is not null and issued_at is not null and cancelled_at is not null)
  )
);

create index invoices_status_date_idx on public.invoices (status, invoice_date desc);
create index invoices_customer_idx on public.invoices (customer_id, invoice_date desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  description text not null check (char_length(btrim(description)) between 1 and 300),
  details text not null default '' check (char_length(details) <= 1000),
  quantity_milli integer not null default 1000 check (quantity_milli between 1 and 100000000),
  unit text not null check (unit in ('flat_rate', 'hour', 'piece', 'sqm', 'custom')),
  custom_unit text check (custom_unit is null or char_length(custom_unit) between 1 and 40),
  unit_price_net_cents bigint not null check (unit_price_net_cents between 0 and 999999999),
  line_total_net_cents bigint not null check (line_total_net_cents between 0 and 999999999999),
  line_total_gross_cents bigint not null check (line_total_gross_cents between 0 and 999999999999),
  position integer not null check (position between 1 and 100),
  created_at timestamptz not null default now(),
  unique (invoice_id, position),
  constraint invoice_items_custom_unit_check check (
    (unit = 'custom' and custom_unit is not null)
    or (unit <> 'custom' and custom_unit is null)
  )
);

create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

comment on table public.invoices is 'Private, immutable-after-issue SauberPlus invoices. All mutations use Super Admin RPCs.';
comment on column public.invoices.customer_snapshot is 'Customer identity and address frozen on the invoice.';
comment on column public.invoices.issuer_snapshot is 'Company, bank, and tax data frozen when the invoice is issued.';

create trigger invoice_customers_touch_updated_at
before update on public.invoice_customers
for each row execute function public.trg_touch_updated_at();

create trigger invoice_settings_touch_updated_at
before update on public.invoice_settings
for each row execute function public.trg_touch_updated_at();

create trigger invoices_touch_updated_at
before update on public.invoices
for each row execute function public.trg_touch_updated_at();

create or replace function public.trg_protect_invoice_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'Invoices cannot be deleted.';
  end if;

  if old.status <> 'draft' and (
    new.invoice_number is distinct from old.invoice_number
    or new.sequence_year is distinct from old.sequence_year
    or new.sequence_number is distinct from old.sequence_number
    or new.pricing_mode is distinct from old.pricing_mode
    or new.customer_id is distinct from old.customer_id
    or new.customer_snapshot is distinct from old.customer_snapshot
    or new.issuer_snapshot is distinct from old.issuer_snapshot
    or new.invoice_date is distinct from old.invoice_date
    or new.service_date is distinct from old.service_date
    or new.payment_terms is distinct from old.payment_terms
    or new.payment_method is distinct from old.payment_method
    or new.subtotal_cents is distinct from old.subtotal_cents
    or new.vat_bps is distinct from old.vat_bps
    or new.vat_cents is distinct from old.vat_cents
    or new.total_cents is distinct from old.total_cents
    or new.notes is distinct from old.notes
    or new.issued_at is distinct from old.issued_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '55000', message = 'Issued invoice identity and financial values are immutable.';
  end if;
  if old.status <> 'draft' and old.pdf_storage_path is not null and (
    new.pdf_storage_path is distinct from old.pdf_storage_path
    or new.pdf_sha256 is distinct from old.pdf_sha256
    or new.pdf_generated_at is distinct from old.pdf_generated_at
  ) then
    raise exception using errcode = '55000', message = 'Archived invoice PDFs are immutable.';
  end if;

  if (old.status = 'draft' and new.status not in ('draft', 'open'))
    or (old.status = 'open' and new.status not in ('open', 'paid', 'cancelled'))
    or (old.status = 'paid' and new.status not in ('paid', 'cancelled'))
    or (old.status = 'cancelled' and new.status <> 'cancelled') then
    raise exception using errcode = '55000', message = 'Invalid invoice status transition.';
  end if;

  return new;
end;
$$;

revoke execute on function public.trg_protect_invoice_history() from public, anon, authenticated;

create trigger invoices_protect_history
before update or delete on public.invoices
for each row execute function public.trg_protect_invoice_history();

create or replace function public.trg_protect_issued_invoice_items()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_status text;
  v_new_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status into v_old_status from public.invoices where id = old.invoice_id;
    if v_old_status is null then
      raise exception using errcode = '23503', message = 'Invoice not found.';
    end if;
    if v_old_status <> 'draft' then
      raise exception using errcode = '55000', message = 'Issued invoice items are immutable.';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select status into v_new_status from public.invoices where id = new.invoice_id;
    if v_new_status is null then
      raise exception using errcode = '23503', message = 'Invoice not found.';
    end if;
    if v_new_status <> 'draft' then
      raise exception using errcode = '55000', message = 'Issued invoice items are immutable.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_protect_issued_invoice_items() from public, anon, authenticated;

create trigger invoice_items_protect_history
before insert or update or delete on public.invoice_items
for each row execute function public.trg_protect_issued_invoice_items();

create or replace function public.save_invoice_settings(p_settings jsonb)
returns public.invoice_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_result public.invoice_settings%rowtype;
  v_vat_bps integer;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception using errcode = '22023', message = 'Invoice settings must be an object.';
  end if;
  if coalesce(p_settings ->> 'default_vat_bps', '') !~ '^[0-9]{1,5}$' then
    raise exception using errcode = '22023', message = 'Invalid VAT rate.';
  end if;
  v_vat_bps := (p_settings ->> 'default_vat_bps')::integer;
  if v_vat_bps > 10000
    or char_length(btrim(coalesce(p_settings ->> 'legal_name', ''))) > 180
    or char_length(coalesce(p_settings ->> 'street_address', '')) > 300
    or char_length(coalesce(p_settings ->> 'postal_code', '')) > 20
    or char_length(coalesce(p_settings ->> 'city', '')) > 120
    or char_length(coalesce(p_settings ->> 'phone', '')) > 50
    or char_length(coalesce(p_settings ->> 'email', '')) > 254
    or char_length(coalesce(p_settings ->> 'website', '')) > 200
    or char_length(coalesce(p_settings ->> 'tax_number', '')) > 80
    or char_length(coalesce(p_settings ->> 'account_holder', '')) > 180
    or char_length(regexp_replace(coalesce(p_settings ->> 'iban', ''), '\s+', '', 'g')) > 34
    or char_length(btrim(coalesce(p_settings ->> 'default_payment_terms', ''))) not between 1 and 160
    or coalesce(p_settings ->> 'invoice_prefix', 'SP') <> 'SP' then
    raise exception using errcode = '22023', message = 'Invalid invoice settings.';
  end if;

  insert into public.invoice_settings (
    singleton, legal_name, street_address, postal_code, city, phone, email,
    website, tax_number, account_holder, iban, default_vat_bps,
    default_payment_terms, invoice_prefix, updated_by
  ) values (
    true,
    btrim(coalesce(p_settings ->> 'legal_name', '')),
    btrim(coalesce(p_settings ->> 'street_address', '')),
    btrim(coalesce(p_settings ->> 'postal_code', '')),
    btrim(coalesce(p_settings ->> 'city', '')),
    btrim(coalesce(p_settings ->> 'phone', '')),
    btrim(coalesce(p_settings ->> 'email', '')),
    btrim(coalesce(p_settings ->> 'website', '')),
    btrim(coalesce(p_settings ->> 'tax_number', '')),
    btrim(coalesce(p_settings ->> 'account_holder', '')),
    upper(regexp_replace(coalesce(p_settings ->> 'iban', ''), '\s+', '', 'g')),
    v_vat_bps,
    btrim(p_settings ->> 'default_payment_terms'),
    'SP',
    v_actor
  )
  on conflict (singleton) do update set
    legal_name = excluded.legal_name,
    street_address = excluded.street_address,
    postal_code = excluded.postal_code,
    city = excluded.city,
    phone = excluded.phone,
    email = excluded.email,
    website = excluded.website,
    tax_number = excluded.tax_number,
    account_holder = excluded.account_holder,
    iban = excluded.iban,
    default_vat_bps = excluded.default_vat_bps,
    default_payment_terms = excluded.default_payment_terms,
    invoice_prefix = excluded.invoice_prefix,
    updated_by = v_actor
  returning * into v_result;

  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'update', 'invoice_settings', 'singleton', jsonb_build_object('configured', true));
  return v_result;
end;
$$;

create or replace function public.save_invoice_draft(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_customer jsonb,
  p_invoice_date date,
  p_service_date date,
  p_payment_method text,
  p_payment_terms text,
  p_vat_bps integer,
  p_pricing_mode text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
  v_customer_id uuid := p_customer_id;
  v_customer_snapshot jsonb;
  v_item jsonb;
  v_position integer := 0;
  v_description text;
  v_details text;
  v_unit text;
  v_custom_unit text;
  v_quantity_milli integer;
  v_unit_price_net_cents bigint;
  v_line_net_cents bigint;
  v_line_gross_cents bigint;
  v_gross_cents bigint;
  v_subtotal_cents bigint := 0;
  v_total_cents bigint := 0;
  v_vat_cents bigint := 0;
  v_running_net_cents bigint := 0;
  v_allocated_vat_cents bigint := 0;
  v_cumulative_vat_cents bigint;
  v_display_name text;
  v_street_address text;
  v_postal_code text;
  v_city text;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  if jsonb_typeof(p_customer) <> 'object' or jsonb_typeof(p_items) <> 'array' then
    raise exception using errcode = '22023', message = 'Customer and items are required.';
  end if;
  if p_invoice_date is null or p_service_date is null
    or p_payment_method not in ('bank_transfer', 'cash')
    or p_pricing_mode not in ('gross', 'net')
    or p_vat_bps not between 0 and 10000
    or char_length(btrim(coalesce(p_payment_terms, ''))) not between 1 and 160
    or char_length(coalesce(p_notes, '')) > 2000
    or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Invalid invoice data.';
  end if;

  v_display_name := btrim(coalesce(p_customer ->> 'display_name', ''));
  v_street_address := btrim(coalesce(p_customer ->> 'street_address', ''));
  v_postal_code := btrim(coalesce(p_customer ->> 'postal_code', ''));
  v_city := btrim(coalesce(p_customer ->> 'city', ''));
  if char_length(v_display_name) not between 1 and 160
    or char_length(v_street_address) not between 1 and 300
    or char_length(v_postal_code) > 20
    or char_length(v_city) > 120
    or char_length(coalesce(p_customer ->> 'salutation', '')) > 50
    or char_length(coalesce(p_customer ->> 'company_name', '')) > 160
    or char_length(coalesce(p_customer ->> 'first_name', '')) > 120
    or char_length(coalesce(p_customer ->> 'last_name', '')) > 120
    or char_length(coalesce(p_customer ->> 'email', '')) > 254
    or char_length(coalesce(p_customer ->> 'phone', '')) > 50 then
    raise exception using errcode = '22023', message = 'Invalid customer data.';
  end if;

  if v_customer_id is null then
    insert into public.invoice_customers (
      display_name, salutation, company_name, first_name, last_name,
      street_address, postal_code, city, email, phone, created_by, updated_by
    ) values (
      v_display_name, nullif(btrim(coalesce(p_customer ->> 'salutation', '')), ''),
      nullif(btrim(coalesce(p_customer ->> 'company_name', '')), ''),
      nullif(btrim(coalesce(p_customer ->> 'first_name', '')), ''),
      nullif(btrim(coalesce(p_customer ->> 'last_name', '')), ''),
      v_street_address, v_postal_code, v_city,
      nullif(btrim(coalesce(p_customer ->> 'email', '')), ''),
      nullif(btrim(coalesce(p_customer ->> 'phone', '')), ''),
      v_actor, v_actor
    ) returning id into v_customer_id;
  elsif not exists (
    select 1 from public.invoice_customers
    where id = v_customer_id and archived_at is null
  ) then
    raise exception using errcode = 'P0002', message = 'Customer not found.';
  end if;

  v_customer_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'display_name', v_display_name,
    'salutation', nullif(btrim(coalesce(p_customer ->> 'salutation', '')), ''),
    'company_name', nullif(btrim(coalesce(p_customer ->> 'company_name', '')), ''),
    'first_name', nullif(btrim(coalesce(p_customer ->> 'first_name', '')), ''),
    'last_name', nullif(btrim(coalesce(p_customer ->> 'last_name', '')), ''),
    'street_address', v_street_address,
    'postal_code', v_postal_code,
    'city', v_city,
    'email', nullif(btrim(coalesce(p_customer ->> 'email', '')), ''),
    'phone', nullif(btrim(coalesce(p_customer ->> 'phone', '')), '')
  ));

  if p_invoice_id is null then
    insert into public.invoices (
      status, pricing_mode, customer_id, customer_snapshot, invoice_date,
      service_date, payment_terms, payment_method, vat_bps, notes,
      created_by, updated_by
    ) values (
      'draft', p_pricing_mode, v_customer_id, v_customer_snapshot,
      p_invoice_date, p_service_date, btrim(p_payment_terms),
      p_payment_method, p_vat_bps, coalesce(p_notes, ''), v_actor, v_actor
    ) returning * into v_invoice;
  else
    select * into v_invoice from public.invoices where id = p_invoice_id for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Invoice not found.';
    end if;
    if v_invoice.status <> 'draft' then
      raise exception using errcode = '55000', message = 'Only draft invoices can be edited.';
    end if;
    update public.invoices set
      pricing_mode = p_pricing_mode,
      customer_id = v_customer_id,
      customer_snapshot = v_customer_snapshot,
      invoice_date = p_invoice_date,
      service_date = p_service_date,
      payment_terms = btrim(p_payment_terms),
      payment_method = p_payment_method,
      vat_bps = p_vat_bps,
      notes = coalesce(p_notes, ''),
      updated_by = v_actor
    where id = p_invoice_id returning * into v_invoice;
    delete from public.invoice_items where invoice_id = v_invoice.id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_position := v_position + 1;
    v_description := btrim(coalesce(v_item ->> 'description', ''));
    v_details := btrim(coalesce(v_item ->> 'details', ''));
    v_unit := coalesce(v_item ->> 'unit', 'flat_rate');
    v_custom_unit := nullif(btrim(coalesce(v_item ->> 'custom_unit', '')), '');
    if char_length(v_description) not between 1 and 300
      or char_length(v_details) > 1000
      or v_unit not in ('flat_rate', 'hour', 'piece', 'sqm', 'custom')
      or (v_unit = 'custom' and (v_custom_unit is null or char_length(v_custom_unit) > 40))
      or (v_unit <> 'custom' and v_custom_unit is not null)
      or coalesce(v_item ->> 'quantity_milli', '') !~ '^[0-9]{1,9}$' then
      raise exception using errcode = '22023', message = 'Invalid invoice item.';
    end if;
    v_quantity_milli := (v_item ->> 'quantity_milli')::integer;
    if v_quantity_milli not between 1 and 100000000 then
      raise exception using errcode = '22023', message = 'Invalid item quantity.';
    end if;

    if p_pricing_mode = 'gross' then
      if coalesce(v_item ->> 'gross_cents', '') !~ '^[0-9]{1,12}$' then
        raise exception using errcode = '22023', message = 'Invalid gross amount.';
      end if;
      v_gross_cents := (v_item ->> 'gross_cents')::bigint;
      if v_gross_cents > 999999999999 then
        raise exception using errcode = '22023', message = 'Gross amount is too large.';
      end if;
      v_line_net_cents := (v_gross_cents * 10000 + ((10000 + p_vat_bps) / 2)) / (10000 + p_vat_bps);
      v_line_gross_cents := v_gross_cents;
      v_unit_price_net_cents := (v_line_net_cents * 1000 + (v_quantity_milli / 2)) / v_quantity_milli;
    else
      if coalesce(v_item ->> 'unit_price_net_cents', '') !~ '^[0-9]{1,9}$' then
        raise exception using errcode = '22023', message = 'Invalid net unit price.';
      end if;
      v_unit_price_net_cents := (v_item ->> 'unit_price_net_cents')::bigint;
      v_line_net_cents := (v_unit_price_net_cents * v_quantity_milli + 500) / 1000;
      v_running_net_cents := v_running_net_cents + v_line_net_cents;
      v_cumulative_vat_cents := (v_running_net_cents * p_vat_bps + 5000) / 10000;
      v_line_gross_cents := v_line_net_cents + v_cumulative_vat_cents - v_allocated_vat_cents;
      v_allocated_vat_cents := v_cumulative_vat_cents;
    end if;

    insert into public.invoice_items (
      invoice_id, description, details, quantity_milli, unit, custom_unit,
      unit_price_net_cents, line_total_net_cents, line_total_gross_cents, position
    ) values (
      v_invoice.id, v_description, v_details, v_quantity_milli, v_unit, v_custom_unit,
      v_unit_price_net_cents, v_line_net_cents, v_line_gross_cents, v_position
    );
    v_subtotal_cents := v_subtotal_cents + v_line_net_cents;
    v_total_cents := v_total_cents + v_line_gross_cents;
  end loop;

  if p_pricing_mode = 'net' then
    v_vat_cents := v_allocated_vat_cents;
    v_total_cents := v_subtotal_cents + v_vat_cents;
  else
    v_vat_cents := v_total_cents - v_subtotal_cents;
  end if;

  update public.invoices set
    subtotal_cents = v_subtotal_cents,
    vat_cents = v_vat_cents,
    total_cents = v_total_cents,
    updated_by = v_actor
  where id = v_invoice.id;

  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (
    v_actor, (select email from public.user_profiles where id = v_actor),
    case when p_invoice_id is null then 'create' else 'update' end,
    'invoices', v_invoice.id::text,
    jsonb_build_object('status', 'draft', 'subtotal_cents', v_subtotal_cents, 'vat_cents', v_vat_cents, 'total_cents', v_total_cents)
  );
  return v_invoice.id;
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
  v_settings public.invoice_settings%rowtype;
  v_year smallint;
  v_sequence integer;
  v_subtotal bigint;
  v_total bigint;
  v_vat bigint;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Invoice not found.';
  end if;
  if v_invoice.status <> 'draft' then
    if v_invoice.invoice_number is not null then
      return v_invoice;
    end if;
    raise exception using errcode = '55000', message = 'Invoice cannot be issued.';
  end if;

  select * into v_settings from public.invoice_settings where singleton = true;
  if not found
    or btrim(v_settings.legal_name) = ''
    or btrim(v_settings.street_address) = ''
    or btrim(v_settings.postal_code) = ''
    or btrim(v_settings.city) = ''
    or btrim(v_settings.tax_number) = ''
    or btrim(v_settings.account_holder) = ''
    or btrim(v_settings.iban) = '' then
    raise exception using errcode = '55000', message = 'Invoice company, tax, and bank settings must be completed before issuing.';
  end if;
  if btrim(coalesce(v_invoice.customer_snapshot ->> 'display_name', '')) = ''
    or btrim(coalesce(v_invoice.customer_snapshot ->> 'street_address', '')) = '' then
    raise exception using errcode = '22023', message = 'Invoice customer snapshot is incomplete.';
  end if;

  select coalesce(sum(line_total_net_cents), 0), coalesce(sum(line_total_gross_cents), 0)
  into v_subtotal, v_total
  from public.invoice_items
  where invoice_id = v_invoice.id;
  if v_subtotal <= 0 or not exists (select 1 from public.invoice_items where invoice_id = v_invoice.id) then
    raise exception using errcode = '22023', message = 'Invoice requires at least one positive line item.';
  end if;
  if v_invoice.pricing_mode = 'net' then
    v_vat := (v_subtotal * v_invoice.vat_bps + 5000) / 10000;
    v_total := v_subtotal + v_vat;
  else
    v_vat := v_total - v_subtotal;
  end if;

  v_year := extract(year from v_invoice.invoice_date)::smallint;
  insert into public.invoice_number_sequences (sequence_year, last_number)
  values (v_year, 1)
  on conflict (sequence_year) do update set
    last_number = public.invoice_number_sequences.last_number + 1,
    updated_at = clock_timestamp()
  returning last_number into v_sequence;

  update public.invoices set
    invoice_number = 'SP-' || v_year::text || '-' || lpad(v_sequence::text, 4, '0'),
    sequence_year = v_year,
    sequence_number = v_sequence,
    status = 'open',
    subtotal_cents = v_subtotal,
    vat_cents = v_vat,
    total_cents = v_total,
    issuer_snapshot = jsonb_build_object(
      'legal_name', v_settings.legal_name,
      'street_address', v_settings.street_address,
      'postal_code', v_settings.postal_code,
      'city', v_settings.city,
      'phone', v_settings.phone,
      'email', v_settings.email,
      'website', v_settings.website,
      'tax_number', v_settings.tax_number,
      'account_holder', v_settings.account_holder,
      'iban', v_settings.iban
    ),
    issued_at = clock_timestamp(),
    updated_by = v_actor
  where id = v_invoice.id
  returning * into v_invoice;

  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (
    v_actor, (select email from public.user_profiles where id = v_actor),
    'issue', 'invoices', v_invoice.id::text,
    jsonb_build_object('invoice_number', v_invoice.invoice_number, 'total_cents', v_invoice.total_cents)
  );
  return v_invoice;
end;
$$;

create or replace function public.mark_invoice_paid(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Invoice not found.'; end if;
  if v_invoice.status = 'paid' then return v_invoice; end if;
  if v_invoice.status <> 'open' then raise exception using errcode = '55000', message = 'Only open invoices can be marked paid.'; end if;
  update public.invoices set status = 'paid', paid_at = clock_timestamp(), updated_by = v_actor
  where id = p_invoice_id returning * into v_invoice;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'paid', 'invoices', v_invoice.id::text, jsonb_build_object('invoice_number', v_invoice.invoice_number));
  return v_invoice;
end;
$$;

create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text default null)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Cancellation reason is too long.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Invoice not found.'; end if;
  if v_invoice.status = 'cancelled' then return v_invoice; end if;
  if v_invoice.status not in ('open', 'paid') then raise exception using errcode = '55000', message = 'Only issued invoices can be cancelled.'; end if;
  update public.invoices set
    status = 'cancelled', cancelled_at = clock_timestamp(),
    cancellation_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_by = v_actor
  where id = p_invoice_id returning * into v_invoice;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'cancel', 'invoices', v_invoice.id::text, jsonb_build_object('invoice_number', v_invoice.invoice_number));
  return v_invoice;
end;
$$;

create or replace function public.duplicate_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_source public.invoices%rowtype;
  v_new_id uuid;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  select * into v_source from public.invoices where id = p_invoice_id;
  if not found then raise exception using errcode = 'P0002', message = 'Invoice not found.'; end if;
  insert into public.invoices (
    status, pricing_mode, customer_id, customer_snapshot, invoice_date,
    service_date, payment_terms, payment_method, subtotal_cents, vat_bps,
    vat_cents, total_cents, notes, created_by, updated_by
  ) values (
    'draft', v_source.pricing_mode, v_source.customer_id, v_source.customer_snapshot,
    current_date, v_source.service_date, v_source.payment_terms, v_source.payment_method,
    v_source.subtotal_cents, v_source.vat_bps, v_source.vat_cents,
    v_source.total_cents, v_source.notes, v_actor, v_actor
  ) returning id into v_new_id;
  insert into public.invoice_items (
    invoice_id, description, details, quantity_milli, unit, custom_unit,
    unit_price_net_cents, line_total_net_cents, line_total_gross_cents, position
  )
  select v_new_id, description, details, quantity_milli, unit, custom_unit,
    unit_price_net_cents, line_total_net_cents, line_total_gross_cents, position
  from public.invoice_items where invoice_id = v_source.id order by position;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'duplicate', 'invoices', v_new_id::text, jsonb_build_object('source_invoice_id', v_source.id));
  return v_new_id;
end;
$$;

create or replace function public.invoice_pdf_path_is_allowed(p_name text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.is_super_admin() and exists (
    select 1 from public.invoices invoice
    where invoice.status <> 'draft'
      and p_name = 'invoices/' || invoice.id::text || '/' || invoice.invoice_number || '.pdf'
  );
$$;

create or replace function public.record_invoice_pdf(p_invoice_id uuid, p_storage_path text, p_sha256 text)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices%rowtype;
  v_expected_path text;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Super Admin access is required.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found or v_invoice.status = 'draft' then
    raise exception using errcode = '55000', message = 'Only issued invoices can archive PDFs.';
  end if;
  v_expected_path := 'invoices/' || v_invoice.id::text || '/' || v_invoice.invoice_number || '.pdf';
  if p_storage_path is distinct from v_expected_path or coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid invoice PDF metadata.';
  end if;
  if v_invoice.pdf_storage_path is not null then
    if v_invoice.pdf_storage_path = p_storage_path and v_invoice.pdf_sha256 = p_sha256 then
      return v_invoice;
    end if;
    raise exception using errcode = '55000', message = 'Archived invoice PDFs are immutable.';
  end if;
  update public.invoices set
    pdf_storage_path = p_storage_path, pdf_sha256 = p_sha256,
    pdf_generated_at = clock_timestamp(), updated_by = v_actor
  where id = p_invoice_id returning * into v_invoice;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'pdf_archive', 'invoices', v_invoice.id::text, jsonb_build_object('invoice_number', v_invoice.invoice_number));
  return v_invoice;
end;
$$;

revoke all on function public.save_invoice_settings(jsonb) from public, anon, authenticated;
revoke all on function public.save_invoice_draft(uuid, uuid, jsonb, date, date, text, text, integer, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.issue_invoice(uuid) from public, anon, authenticated;
revoke all on function public.mark_invoice_paid(uuid) from public, anon, authenticated;
revoke all on function public.cancel_invoice(uuid, text) from public, anon, authenticated;
revoke all on function public.duplicate_invoice(uuid) from public, anon, authenticated;
revoke all on function public.invoice_pdf_path_is_allowed(text) from public, anon, authenticated;
revoke all on function public.record_invoice_pdf(uuid, text, text) from public, anon, authenticated;

grant execute on function public.save_invoice_settings(jsonb) to authenticated;
grant execute on function public.save_invoice_draft(uuid, uuid, jsonb, date, date, text, text, integer, text, text, jsonb) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.mark_invoice_paid(uuid) to authenticated;
grant execute on function public.cancel_invoice(uuid, text) to authenticated;
grant execute on function public.duplicate_invoice(uuid) to authenticated;
grant execute on function public.invoice_pdf_path_is_allowed(text) to authenticated;
grant execute on function public.record_invoice_pdf(uuid, text, text) to authenticated;

alter table public.invoice_customers enable row level security;
alter table public.invoice_settings enable row level security;
alter table public.invoice_number_sequences enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

revoke all on public.invoice_customers, public.invoice_settings, public.invoice_number_sequences, public.invoices, public.invoice_items from public, anon, authenticated;
grant select on public.invoice_customers, public.invoice_settings, public.invoices, public.invoice_items to authenticated;

create policy invoice_customers_super_admin_read on public.invoice_customers
for select to authenticated using (public.is_super_admin());
create policy invoice_settings_super_admin_read on public.invoice_settings
for select to authenticated using (public.is_super_admin());
create policy invoices_super_admin_read on public.invoices
for select to authenticated using (public.is_super_admin());
create policy invoice_items_super_admin_read on public.invoice_items
for select to authenticated using (public.is_super_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-pdfs', 'invoice-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy invoice_pdfs_super_admin_read on storage.objects
for select to authenticated
using (bucket_id = 'invoice-pdfs' and public.invoice_pdf_path_is_allowed(name));

create policy invoice_pdfs_super_admin_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'invoice-pdfs' and public.invoice_pdf_path_is_allowed(name));

commit;
