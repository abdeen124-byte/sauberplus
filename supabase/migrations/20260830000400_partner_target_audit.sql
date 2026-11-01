begin;

create or replace function public.set_partner_target(p_partner_id uuid,p_target_cents bigint default null)
returns public.partner_financial_profiles
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_previous public.partner_financial_profiles%rowtype;
  v_profile public.partner_financial_profiles%rowtype;
  v_action text;
begin
  if not public.is_super_admin() then
    raise exception using errcode='42501',message='Super Admin access is required.';
  end if;
  if p_partner_id is null or (p_target_cents is not null and p_target_cents not between 0 and 999999999999) then
    raise exception using errcode='22023',message='Invalid contribution target.';
  end if;

  select * into v_previous
  from public.partner_financial_profiles
  where id=p_partner_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='Partner not found.';
  end if;
  if v_previous.target_cents is not distinct from p_target_cents then
    return v_previous;
  end if;

  update public.partner_financial_profiles
  set target_cents=p_target_cents,updated_by=v_actor
  where id=p_partner_id
  returning * into v_profile;

  v_action := case
    when p_target_cents is null then 'partner_target_removed'
    when v_previous.target_cents is null then 'partner_target_set'
    else 'partner_target_changed'
  end;

  insert into public.activity_log(actor_user_id,actor_email,action,entity_type,entity_id,previous_value,new_value)
  values(
    v_actor,
    (select email from public.user_profiles where id=v_actor),
    v_action,
    'partner_financial_profiles',
    v_profile.id::text,
    jsonb_build_object('target_cents',v_previous.target_cents),
    jsonb_build_object('target_cents',v_profile.target_cents,'partner_id',v_profile.id)
  );

  return v_profile;
end;
$$;

revoke all on function public.set_partner_target(uuid,bigint) from public,anon,authenticated;
grant execute on function public.set_partner_target(uuid,bigint) to authenticated;

commit;
