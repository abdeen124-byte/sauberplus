set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select public.save_expense(jsonb_build_object(
  'supplier_name','Concurrent Supplier','supplier_document_number',null,'expense_date','2026-08-30',
  'category_id',(select id from public.expense_categories where code='office'),'description','Concurrency check',
  'subtotal_cents','1000','tax_cents','190','total_cents','1190','tax_rate_bps','1900','tax_breakdown','[]'::jsonb,
  'payment_method','card','paid_by_type','company_account','paid_by_partner_id',null,'status','paid','extraction_status','manual','duplicate_confirmed',true,'notes',''
),null);
