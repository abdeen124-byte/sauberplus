begin;

alter table public.invoices
  add column numbering_scheme text not null default 'native';

alter table public.invoices
  add column source_pdf_sha256 text
  check (source_pdf_sha256 is null or source_pdf_sha256 ~ '^[0-9a-f]{64}$');

alter table public.invoices
  drop constraint if exists invoices_invoice_number_check;

alter table public.invoices
  add constraint invoices_numbering_scheme_check check (
    (
      status = 'draft'
      and numbering_scheme = 'native'
      and invoice_number is null
      and source_pdf_sha256 is null
    )
    or (
      status <> 'draft'
      and numbering_scheme = 'native'
      and invoice_number = 'SP-' || sequence_year::text || '-' || lpad(sequence_number::text, 4, '0')
      and source_pdf_sha256 is null
    )
    or (
      status <> 'draft'
      and numbering_scheme = 'legacy'
      and sequence_number between 1 and 999
      and sequence_year = extract(year from invoice_date)::smallint
      and source_pdf_sha256 is not null
      and invoice_number = 'SP-'
        || extract(year from invoice_date)::integer::text
        || '-'
        || to_char(invoice_date, 'MMDD')
        || '-'
        || lpad(sequence_number::text, 3, '0')
    )
  );

alter table public.invoices
  add constraint invoices_numbering_scheme_value_check
  check (numbering_scheme in ('native', 'legacy'));

comment on column public.invoices.numbering_scheme is
  'Native invoices use SP-YYYY-NNNN. Legacy invoices preserve their historical SP-YYYY-MMDD-NNN number.';
comment on column public.invoices.source_pdf_sha256 is
  'Expected SHA-256 of an imported historical source PDF; immutable and required for legacy invoices.';

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
    or new.numbering_scheme is distinct from old.numbering_scheme
    or new.source_pdf_sha256 is distinct from old.source_pdf_sha256
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

create or replace function public.import_legacy_invoice(p_payload jsonb)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_invoice public.invoices%rowtype;
  v_customer_id uuid;
  v_invoice_date date;
  v_service_date date;
  v_sequence_year smallint;
  v_sequence_number integer;
  v_previous_sequence integer;
  v_subtotal_cents bigint;
  v_vat_cents bigint;
  v_total_cents bigint;
  v_item_net_cents bigint;
  v_item_gross_cents bigint;
  v_source_sha256 text;
  v_invoice_number text;
  v_customer jsonb;
  v_issuer jsonb;
  v_items jsonb;
  v_item jsonb;
  v_position integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Service role access is required.';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Legacy invoice payload must be an object.';
  end if;
  if octet_length(p_payload::text) > 40000 then
    raise exception using errcode = '22023', message = 'Legacy invoice payload is too large.';
  end if;
  if coalesce(p_payload ->> 'actor_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid import actor is required.';
  end if;
  v_actor := (p_payload ->> 'actor_id')::uuid;
  if not exists (
    select 1 from public.user_profiles
    where id = v_actor
      and role = 'super_admin'
      and disabled = false
      and archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'The import actor must be an active Super Admin.';
  end if;

  v_customer := p_payload -> 'customer_snapshot';
  v_issuer := p_payload -> 'issuer_snapshot';
  v_items := p_payload -> 'items';
  if jsonb_typeof(v_customer) <> 'object'
    or jsonb_typeof(v_issuer) <> 'object'
    or jsonb_typeof(v_items) <> 'array'
    or jsonb_array_length(v_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Customer, issuer, and one to one hundred items are required.';
  end if;

  if coalesce(p_payload ->> 'invoice_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_payload ->> 'service_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or coalesce(p_payload ->> 'sequence_number', '') !~ '^\d{1,3}$'
    or coalesce(p_payload ->> 'subtotal_cents', '') !~ '^\d{1,12}$'
    or coalesce(p_payload ->> 'vat_cents', '') !~ '^\d{1,12}$'
    or coalesce(p_payload ->> 'total_cents', '') !~ '^\d{1,12}$'
    or coalesce(p_payload ->> 'source_sha256', '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Legacy invoice dates, amounts, sequence, or source hash are invalid.';
  end if;

  v_invoice_date := (p_payload ->> 'invoice_date')::date;
  v_service_date := (p_payload ->> 'service_date')::date;
  v_sequence_year := extract(year from v_invoice_date)::smallint;
  v_sequence_number := (p_payload ->> 'sequence_number')::integer;
  v_subtotal_cents := (p_payload ->> 'subtotal_cents')::bigint;
  v_vat_cents := (p_payload ->> 'vat_cents')::bigint;
  v_total_cents := (p_payload ->> 'total_cents')::bigint;
  v_source_sha256 := p_payload ->> 'source_sha256';
  v_invoice_number := 'SP-' || v_sequence_year::text || '-' || to_char(v_invoice_date, 'MMDD') || '-' || lpad(v_sequence_number::text, 3, '0');

  if v_sequence_number not between 1 and 999
    or v_subtotal_cents <= 0
    or v_vat_cents < 0
    or v_total_cents <= 0
    or v_total_cents <> v_subtotal_cents + v_vat_cents
    or v_subtotal_cents <> (v_total_cents * 10000 + 5950) / 11900
    or coalesce(p_payload ->> 'pricing_mode', '') <> 'gross'
    or coalesce(p_payload ->> 'vat_bps', '') <> '1900'
    or coalesce(p_payload ->> 'payment_method', '') not in ('bank_transfer', 'cash')
    or char_length(btrim(coalesce(p_payload ->> 'payment_terms', ''))) not between 1 and 160
    or char_length(coalesce(p_payload ->> 'notes', '')) > 2000 then
    raise exception using errcode = '22023', message = 'Legacy invoice financial or payment values are invalid.';
  end if;

  if char_length(btrim(coalesce(v_customer ->> 'display_name', ''))) not between 1 and 160
    or char_length(btrim(coalesce(v_customer ->> 'street_address', ''))) not between 1 and 300
    or char_length(btrim(coalesce(v_customer ->> 'postal_code', ''))) not between 1 and 20
    or char_length(btrim(coalesce(v_customer ->> 'city', ''))) not between 1 and 120
    or char_length(coalesce(v_customer ->> 'salutation', '')) > 50
    or char_length(coalesce(v_customer ->> 'company_name', '')) > 160
    or char_length(coalesce(v_customer ->> 'first_name', '')) > 120
    or char_length(coalesce(v_customer ->> 'last_name', '')) > 120
    or char_length(coalesce(v_customer ->> 'email', '')) > 254
    or char_length(coalesce(v_customer ->> 'phone', '')) > 50 then
    raise exception using errcode = '22023', message = 'Legacy customer snapshot is invalid.';
  end if;

  if char_length(btrim(coalesce(v_issuer ->> 'legal_name', ''))) not between 1 and 180
    or char_length(btrim(coalesce(v_issuer ->> 'street_address', ''))) not between 1 and 300
    or char_length(btrim(coalesce(v_issuer ->> 'postal_code', ''))) not between 1 and 20
    or char_length(btrim(coalesce(v_issuer ->> 'city', ''))) not between 1 and 120
    or char_length(coalesce(v_issuer ->> 'phone', '')) > 50
    or char_length(coalesce(v_issuer ->> 'email', '')) > 254
    or char_length(coalesce(v_issuer ->> 'website', '')) > 200
    or char_length(btrim(coalesce(v_issuer ->> 'tax_number', ''))) not between 1 and 80
    or char_length(btrim(coalesce(v_issuer ->> 'account_holder', ''))) not between 1 and 180
    or char_length(btrim(coalesce(v_issuer ->> 'iban', ''))) not between 1 and 42 then
    raise exception using errcode = '22023', message = 'Legacy issuer snapshot is invalid.';
  end if;

  v_item_net_cents := 0;
  v_item_gross_cents := 0;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or char_length(btrim(coalesce(v_item ->> 'description', ''))) not between 1 and 300
      or char_length(coalesce(v_item ->> 'details', '')) > 1000
      or coalesce(v_item ->> 'quantity_milli', '') !~ '^\d{1,9}$'
      or coalesce(v_item ->> 'unit_price_net_cents', '') !~ '^\d{1,9}$'
      or coalesce(v_item ->> 'line_total_net_cents', '') !~ '^\d{1,12}$'
      or coalesce(v_item ->> 'line_total_gross_cents', '') !~ '^\d{1,12}$'
      or coalesce(v_item ->> 'unit', '') not in ('flat_rate', 'hour', 'piece', 'sqm', 'custom')
      or (v_item ->> 'unit') = 'custom' and char_length(btrim(coalesce(v_item ->> 'custom_unit', ''))) not between 1 and 40
      or (v_item ->> 'unit') <> 'custom' and nullif(btrim(coalesce(v_item ->> 'custom_unit', '')), '') is not null
      or (v_item ->> 'quantity_milli')::integer not between 1 and 100000000
      or (v_item ->> 'unit_price_net_cents')::bigint not between 0 and 999999999
      or (v_item ->> 'line_total_net_cents')::bigint not between 0 and 999999999999
      or (v_item ->> 'line_total_gross_cents')::bigint not between 0 and 999999999999
      or ((v_item ->> 'unit_price_net_cents')::bigint * (v_item ->> 'quantity_milli')::integer + 500) / 1000
        <> (v_item ->> 'line_total_net_cents')::bigint
      or (v_item ->> 'line_total_gross_cents')::bigint < (v_item ->> 'line_total_net_cents')::bigint then
      raise exception using errcode = '22023', message = 'Legacy invoice item is invalid.';
    end if;
    v_item_net_cents := v_item_net_cents + (v_item ->> 'line_total_net_cents')::bigint;
    v_item_gross_cents := v_item_gross_cents + (v_item ->> 'line_total_gross_cents')::bigint;
  end loop;
  if v_item_net_cents <> v_subtotal_cents or v_item_gross_cents <> v_total_cents then
    raise exception using errcode = '22023', message = 'Legacy item totals do not match the invoice totals.';
  end if;

  insert into public.invoice_number_sequences (sequence_year, last_number)
  values (v_sequence_year, 0)
  on conflict (sequence_year) do update
    set last_number = public.invoice_number_sequences.last_number
  returning last_number into v_previous_sequence;
  if v_previous_sequence >= v_sequence_number then
    raise exception using errcode = '55000', message = 'The annual invoice sequence already reached or passed this legacy number.';
  end if;
  if exists (
    select 1 from public.invoices
    where invoice_number = v_invoice_number
      or (sequence_year = v_sequence_year and sequence_number = v_sequence_number)
  ) then
    raise exception using errcode = '23505', message = 'The legacy invoice number or sequence already exists.';
  end if;

  insert into public.invoice_customers (
    display_name, salutation, company_name, first_name, last_name,
    street_address, postal_code, city, email, phone, created_by, updated_by
  ) values (
    btrim(v_customer ->> 'display_name'), nullif(btrim(coalesce(v_customer ->> 'salutation', '')), ''),
    nullif(btrim(coalesce(v_customer ->> 'company_name', '')), ''), nullif(btrim(coalesce(v_customer ->> 'first_name', '')), ''),
    nullif(btrim(coalesce(v_customer ->> 'last_name', '')), ''), btrim(v_customer ->> 'street_address'),
    btrim(coalesce(v_customer ->> 'postal_code', '')), btrim(coalesce(v_customer ->> 'city', '')),
    nullif(btrim(coalesce(v_customer ->> 'email', '')), ''), nullif(btrim(coalesce(v_customer ->> 'phone', '')), ''),
    v_actor, v_actor
  ) returning id into v_customer_id;

  insert into public.invoices (
    status, pricing_mode, customer_id, customer_snapshot, issuer_snapshot, invoice_date, service_date,
    payment_terms, payment_method, subtotal_cents, vat_bps, vat_cents, total_cents,
    notes, created_by, updated_by
  ) values (
    'draft', 'gross', v_customer_id, v_customer, '{}'::jsonb, v_invoice_date, v_service_date,
    btrim(p_payload ->> 'payment_terms'), p_payload ->> 'payment_method',
    0, 1900, 0, 0, coalesce(p_payload ->> 'notes', ''), v_actor, v_actor
  ) returning * into v_invoice;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_position := v_position + 1;
    insert into public.invoice_items (
      invoice_id, description, details, quantity_milli, unit, custom_unit,
      unit_price_net_cents, line_total_net_cents, line_total_gross_cents, position
    ) values (
      v_invoice.id, btrim(v_item ->> 'description'), coalesce(v_item ->> 'details', ''),
      (v_item ->> 'quantity_milli')::integer, v_item ->> 'unit',
      case when (v_item ->> 'unit') = 'custom' then btrim(v_item ->> 'custom_unit') else null end,
      (v_item ->> 'unit_price_net_cents')::bigint,
      (v_item ->> 'line_total_net_cents')::bigint,
      (v_item ->> 'line_total_gross_cents')::bigint, v_position
    );
  end loop;

  update public.invoices set
    invoice_number = v_invoice_number,
    numbering_scheme = 'legacy',
    source_pdf_sha256 = v_source_sha256,
    sequence_year = v_sequence_year,
    sequence_number = v_sequence_number,
    status = 'open',
    issuer_snapshot = v_issuer,
    subtotal_cents = v_subtotal_cents,
    vat_cents = v_vat_cents,
    total_cents = v_total_cents,
    issued_at = v_invoice_date::timestamp at time zone 'Europe/Berlin',
    updated_by = v_actor
  where id = v_invoice.id
  returning * into v_invoice;

  update public.invoice_number_sequences
  set last_number = v_sequence_number, updated_at = clock_timestamp()
  where sequence_year = v_sequence_year;

  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (
    v_actor, (select email from public.user_profiles where id = v_actor),
    'legacy_import', 'invoices', v_invoice.id::text,
    jsonb_build_object(
      'invoice_number', v_invoice.invoice_number,
      'subtotal_cents', v_subtotal_cents,
      'vat_cents', v_vat_cents,
      'total_cents', v_total_cents,
      'source_sha256', v_source_sha256
    )
  );
  return v_invoice;
end;
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
  if not public.is_super_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Super Admin or service role access is required.';
  end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid PDF checksum.';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Invoice not found.'; end if;
  if v_invoice.status = 'draft' then
    raise exception using errcode = '55000', message = 'Only issued invoices can archive PDFs.';
  end if;
  v_expected_path := 'invoices/' || v_invoice.id::text || '/' || v_invoice.invoice_number || '.pdf';
  if p_storage_path is distinct from v_expected_path then
    raise exception using errcode = '22023', message = 'Invalid invoice PDF path.';
  end if;
  if v_invoice.source_pdf_sha256 is not null and p_sha256 <> v_invoice.source_pdf_sha256 then
    raise exception using errcode = '22023', message = 'The PDF checksum does not match the imported source document.';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'invoice-pdfs' and name = v_expected_path
  ) then
    raise exception using errcode = 'P0002', message = 'Archived invoice PDF object was not found.';
  end if;
  if v_invoice.pdf_storage_path is not null then
    if v_invoice.pdf_storage_path = v_expected_path and v_invoice.pdf_sha256 = p_sha256 then
      return v_invoice;
    end if;
    raise exception using errcode = '55000', message = 'An immutable PDF is already archived for this invoice.';
  end if;
  if v_actor is null then
    v_actor := v_invoice.updated_by;
  end if;
  update public.invoices set
    pdf_storage_path = v_expected_path,
    pdf_sha256 = p_sha256,
    pdf_generated_at = clock_timestamp(),
    updated_by = v_actor
  where id = v_invoice.id returning * into v_invoice;
  insert into public.activity_log (actor_user_id, actor_email, action, entity_type, entity_id, new_value)
  values (v_actor, (select email from public.user_profiles where id = v_actor), 'pdf_archive', 'invoices', v_invoice.id::text, jsonb_build_object('invoice_number', v_invoice.invoice_number));
  return v_invoice;
end;
$$;

revoke all on function public.import_legacy_invoice(jsonb) from public, anon, authenticated;
grant execute on function public.import_legacy_invoice(jsonb) to service_role;

revoke all on function public.record_invoice_pdf(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_invoice_pdf(uuid, text, text) to authenticated, service_role;

commit;
