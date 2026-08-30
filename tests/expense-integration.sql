set request.jwt.claim.role = 'service_role';
select public.bootstrap_partner_finances(jsonb_build_object(
  'actor_id','10000000-0000-4000-8000-000000000001',
  'partners',jsonb_build_array(
    jsonb_build_object('display_name','Partner A','opening_cents','21000'),
    jsonb_build_object('display_name','Partner B','opening_cents','6000'),
    jsonb_build_object('display_name','Partner C','opening_cents','0')
  )
));

set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

do $$
declare v_category uuid; v_partner uuid; v_expense public.expenses; v_draft public.expenses; v_reimbursement public.partner_transactions; v_summary record; v_failed boolean := false;
begin
  select id into v_category from public.expense_categories where code='office';
  select id into v_partner from public.partner_financial_profiles where display_name='Partner A';
  perform public.add_partner_contribution(v_partner,1000,date '2026-08-30','bank_transfer','Integration',null);
  select * into v_expense from public.save_expense(jsonb_build_object(
    'supplier_name','Test Supplier','supplier_document_number','T-001','expense_date','2026-08-30','category_id',v_category,
    'description','Office test','subtotal_cents','4303','tax_cents','817','total_cents','5120','tax_rate_bps','1900','tax_breakdown','[]'::jsonb,
    'payment_method','card','paid_by_type','partner','paid_by_partner_id',v_partner,'status','paid','extraction_status','manual','duplicate_confirmed',false,'notes',''
  ),null);
  if v_expense.expense_number <> 'EXP-2026-0001' or v_expense.total_cents<>5120 or v_expense.tax_cents<>817 then raise exception 'Expense totals or numbering failed'; end if;
  select * into v_reimbursement from public.reimburse_partner_expense(v_expense.id,2120,date '2026-08-30','bank_transfer','Partial',null);
  perform public.reverse_partner_transaction(v_reimbursement.id,date '2026-08-30','Correction test');
  select * into v_summary from public.partner_financial_summary() where partner_id=v_partner;
  if v_summary.reimbursed_cents<>0 or v_summary.open_reimbursement_cents<>5120 then raise exception 'Reimbursement reversal failed'; end if;
  perform public.reimburse_partner_expense(v_expense.id,2120,date '2026-08-30','bank_transfer','Partial corrected',null);
  select * into v_summary from public.partner_financial_summary() where partner_id=v_partner;
  if v_summary.contribution_cents<>22000 or v_summary.advance_cents<>5120 or v_summary.reimbursed_cents<>2120 or v_summary.open_reimbursement_cents<>3000 then raise exception 'Partner separation failed: %',row_to_json(v_summary); end if;
  begin
    update public.partner_transactions set amount_cents=1 where partner_id=v_partner;
  exception when sqlstate '55000' then v_failed:=true;
  end;
  if not v_failed then raise exception 'Immutable partner ledger failed'; end if;
  v_failed:=false;
  begin
    perform public.save_expense(jsonb_build_object('supplier_name','Bad VAT','expense_date','2026-08-30','category_id',v_category,'description','Rejected',
      'subtotal_cents','10000','tax_cents','0','total_cents','10000','tax_rate_bps','1900','tax_breakdown','[]'::jsonb,'payment_method','card','paid_by_type','company_account','status','paid','extraction_status','manual'),null);
  exception when sqlstate '22023' then v_failed:=true;
  end;
  if not v_failed then raise exception 'Database VAT-rate validation failed'; end if;
  select * into v_draft from public.save_expense(jsonb_build_object('supplier_name','Draft Supplier','expense_date','2026-08-30','category_id',v_category,'description','Draft flow',
    'subtotal_cents','1000','tax_cents','190','total_cents','1190','tax_rate_bps','1900','tax_breakdown','[]'::jsonb,'payment_method','card','paid_by_type','company_account','status','draft','extraction_status','manual'),null);
  perform public.finalize_expense_draft(v_draft.id,'paid');
  if (select status from public.expenses where id=v_draft.id)<>'paid' then raise exception 'Draft finalization failed'; end if;
end;
$$;

insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000002','unauthorized@example.invalid');
insert into public.user_profiles(id,email,display_name,role) values('20000000-0000-4000-8000-000000000002','unauthorized@example.invalid','Unauthorized','content_manager');
set request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
do $$
declare v_failed boolean:=false; v_partner uuid;
begin
  select id into v_partner from public.partner_financial_profiles limit 1;
  begin perform public.add_partner_contribution(v_partner,100,date '2026-08-30','cash','',null);
  exception when sqlstate '42501' then v_failed:=true;
  end;
  if not v_failed then raise exception 'Authorization boundary failed'; end if;
end;
$$;
