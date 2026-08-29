set local request.jwt.claim.role = 'authenticated';

do $denial$
declare
  v_rejected boolean := false;
begin
  begin
    perform public.import_legacy_invoice('{}'::jsonb);
  exception
    when sqlstate '42501' then
      v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'A non-service claim reached the legacy importer.';
  end if;
end;
$denial$;

set local request.jwt.claim.role = 'service_role';

do $test$
declare
  v_payload jsonb := jsonb_build_object(
    'actor_id', '10000000-0000-4000-8000-000000000001',
    'invoice_date', '2026-08-28',
    'service_date', '2026-08-28',
    'sequence_number', 1,
    'pricing_mode', 'gross',
    'vat_bps', 1900,
    'subtotal_cents', 4303,
    'vat_cents', 817,
    'total_cents', 5120,
    'payment_terms', 'zahlbar nach Erhalt',
    'payment_method', 'bank_transfer',
    'notes', 'Sanitized transactional integration fixture.',
    'source_sha256', repeat('a', 64),
    'customer_snapshot', jsonb_build_object(
      'display_name', 'Integration Fixture',
      'street_address', 'Testweg 1',
      'postal_code', '00000',
      'city', 'Teststadt'
    ),
    'issuer_snapshot', jsonb_build_object(
      'legal_name', 'Integration Fixture GbR',
      'street_address', 'Testweg 2',
      'postal_code', '00000',
      'city', 'Teststadt',
      'phone', '',
      'email', 'fixture@example.invalid',
      'website', 'example.invalid',
      'tax_number', 'TEST-TAX',
      'account_holder', 'Integration Fixture',
      'iban', 'TEST-IBAN'
    ),
    'items', jsonb_build_array(jsonb_build_object(
      'description', 'Sanitized integration service',
      'details', 'Trigger-order verification',
      'quantity_milli', 1000,
      'unit', 'flat_rate',
      'custom_unit', null,
      'unit_price_net_cents', 4303,
      'line_total_net_cents', 4303,
      'line_total_gross_cents', 5120
    ))
  );
  v_invoice public.invoices%rowtype;
  v_native_draft public.invoices%rowtype;
  v_native_invoice public.invoices%rowtype;
  v_duplicate_rejected boolean := false;
  v_hash_rejected boolean := false;
begin
  select * into v_invoice from public.import_legacy_invoice(v_payload);

  if v_invoice.status <> 'open'
    or v_invoice.numbering_scheme <> 'legacy'
    or v_invoice.invoice_number <> 'SP-2026-0828-001'
    or v_invoice.source_pdf_sha256 <> repeat('a', 64)
    or v_invoice.subtotal_cents <> 4303
    or v_invoice.vat_cents <> 817
    or v_invoice.total_cents <> 5120 then
    raise exception 'Legacy import returned an invalid issued invoice.';
  end if;
  if (select count(*) from public.invoice_items where invoice_id = v_invoice.id) <> 1 then
    raise exception 'Legacy item insert did not survive the draft-to-open transition.';
  end if;
  if (select last_number from public.invoice_number_sequences where sequence_year = 2026) <> 1 then
    raise exception 'Legacy import did not reserve the annual sequence.';
  end if;

  begin
    perform public.import_legacy_invoice(v_payload);
  exception
    when sqlstate '55000' then
      v_duplicate_rejected := true;
  end;
  if not v_duplicate_rejected then
    raise exception 'Duplicate or stale legacy sequence was not rejected.';
  end if;
  if (select count(*) from public.invoices where sequence_year = 2026 and sequence_number = 1) <> 1 then
    raise exception 'Rejected duplicate import changed invoice state.';
  end if;

  insert into storage.objects (bucket_id, name)
  values ('invoice-pdfs', 'invoices/' || v_invoice.id::text || '/' || v_invoice.invoice_number || '.pdf');
  begin
    perform public.record_invoice_pdf(
      v_invoice.id,
      'invoices/' || v_invoice.id::text || '/' || v_invoice.invoice_number || '.pdf',
      repeat('b', 64)
    );
  exception
    when sqlstate '22023' then
      v_hash_rejected := true;
  end;
  if not v_hash_rejected or (select pdf_storage_path from public.invoices where id = v_invoice.id) is not null then
    raise exception 'A mismatched historical PDF checksum was recorded.';
  end if;
  select * into v_invoice from public.record_invoice_pdf(
    v_invoice.id,
    'invoices/' || v_invoice.id::text || '/' || v_invoice.invoice_number || '.pdf',
    repeat('a', 64)
  );
  if v_invoice.pdf_sha256 <> repeat('a', 64) then
    raise exception 'The matching historical PDF checksum was not recorded.';
  end if;

  insert into public.invoice_settings (
    legal_name, street_address, postal_code, city, phone, email, website,
    tax_number, account_holder, iban, updated_by
  ) values (
    'Integration Fixture GbR', 'Testweg 2', '00000', 'Teststadt', '',
    'fixture@example.invalid', 'example.invalid', 'TEST-TAX',
    'Integration Fixture', 'TEST-IBAN', v_invoice.updated_by
  );
  insert into public.invoices (
    status, pricing_mode, customer_id, customer_snapshot, issuer_snapshot,
    invoice_date, service_date, payment_terms, payment_method,
    subtotal_cents, vat_bps, vat_cents, total_cents, notes, created_by, updated_by
  ) values (
    'draft', 'gross', v_invoice.customer_id, v_invoice.customer_snapshot, '{}'::jsonb,
    '2026-08-28', '2026-08-28', 'zahlbar nach Erhalt', 'bank_transfer',
    0, 1900, 0, 0, '', v_invoice.updated_by, v_invoice.updated_by
  ) returning * into v_native_draft;
  insert into public.invoice_items (
    invoice_id, description, details, quantity_milli, unit, custom_unit,
    unit_price_net_cents, line_total_net_cents, line_total_gross_cents, position
  ) values (
    v_native_draft.id, 'Native sequence integration service', '', 1000, 'flat_rate', null,
    4303, 4303, 5120, 1
  );
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_invoice.updated_by::text, true);
  select * into v_native_invoice from public.issue_invoice(v_native_draft.id);
  if v_native_invoice.invoice_number <> 'SP-2026-0002'
    or v_native_invoice.sequence_number <> 2
    or (select last_number from public.invoice_number_sequences where sequence_year = 2026) <> 2 then
    raise exception 'Native issuance did not continue at sequence two.';
  end if;
end;
$test$;
