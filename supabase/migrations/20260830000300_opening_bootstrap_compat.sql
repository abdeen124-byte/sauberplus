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
      values(v_profile,'opening_contribution',(v_partner->>'opening_cents')::bigint,null,'unknown_opening',null,'Eröffnungsbestand / Import',v_actor);
    end if;
    v_count:=v_count+1;
  end loop;
  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,new_value)
  values(v_actor,(select email from public.user_profiles where id=v_actor),'bootstrap','partner_financial_profiles','opening',jsonb_build_object('partner_count',v_count));
  return v_count;
end;
$$;
