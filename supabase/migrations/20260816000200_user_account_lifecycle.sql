begin;

create or replace function public.trg_guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_removing_last_candidate boolean := tg_op = 'DELETE';
begin
  if tg_op = 'UPDATE' then
    v_removing_last_candidate := new.role <> 'super_admin' or new.disabled;
  end if;

  if old.role = 'super_admin' and not old.disabled and v_removing_last_candidate then
    perform pg_advisory_xact_lock(hashtextextended('sauberplus:last-super-admin', 0));

    if not exists (
      select 1
      from public.user_profiles profile
      where profile.role = 'super_admin'
        and not profile.disabled
        and profile.id <> old.id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Der letzte aktive Super Admin kann nicht deaktiviert, gelöscht oder herabgestuft werden.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_guard_last_super_admin() from public, anon, authenticated;

drop trigger if exists user_profiles_guard_last_super_admin on public.user_profiles;
create trigger user_profiles_guard_last_super_admin
before update of role, disabled or delete on public.user_profiles
for each row execute function public.trg_guard_last_super_admin();

create or replace function public.manage_user_account(
  p_user_id uuid,
  p_action text,
  p_role text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := (select auth.uid());
  v_target public.user_profiles%rowtype;
  v_archive_date date;
begin
  if not public.is_super_admin() then
    raise exception using errcode = '42501', message = 'Nur Super Admins können Benutzerkonten verwalten.';
  end if;

  if p_user_id is null or p_action is null or p_action not in ('enable', 'disable', 'delete', 'role') then
    raise exception using errcode = '22023', message = 'Ungültige Kontoaktion.';
  end if;

  select * into v_target
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Das Benutzerkonto wurde nicht gefunden.';
  end if;

  if p_user_id = v_actor and p_action in ('disable', 'delete', 'role') then
    raise exception using errcode = 'P0001', message = 'Das eigene Administratorkonto kann hier nicht geändert werden.';
  end if;

  if p_action = 'role' then
    if v_target.role = 'employee' or p_role is null or p_role not in ('super_admin', 'content_manager') then
      raise exception using errcode = '22023', message = 'Ungültige Administratorrolle.';
    end if;

    update public.user_profiles
    set role = p_role
    where id = p_user_id;
    return;
  end if;

  if p_action = 'enable' then
    update public.user_profiles
    set disabled = false
    where id = p_user_id;
    return;
  end if;

  update public.user_profiles
  set disabled = true
  where id = p_user_id;

  if p_action = 'delete' then
    if v_target.role = 'employee' then
      select greatest(current_date, coalesce(employee.employment_start_date, current_date))
      into v_archive_date
      from public.employees employee
      where employee.id = p_user_id;

      update public.employees
      set employment_end_date = case
            when employment_end_date is null or employment_end_date > v_archive_date then v_archive_date
            else employment_end_date
          end,
          updated_by = v_actor
      where id = p_user_id;
    end if;

    insert into public.activity_log (
      actor_user_id,
      actor_email,
      action,
      entity_type,
      entity_id,
      previous_value
    ) values (
      v_actor,
      (select email from public.user_profiles where id = v_actor),
      'delete',
      'user_profiles',
      p_user_id::text,
      jsonb_build_object(
        'email', v_target.email,
        'display_name', v_target.display_name,
        'role', v_target.role,
        'disabled', v_target.disabled
      )
    );
  end if;
end;
$$;

revoke execute on function public.manage_user_account(uuid, text, text) from public, anon, authenticated;
grant execute on function public.manage_user_account(uuid, text, text) to authenticated;

comment on function public.manage_user_account(uuid, text, text) is
  'Transactional Super Admin lifecycle operations. Delete archives access and preserves workforce records.';

commit;
