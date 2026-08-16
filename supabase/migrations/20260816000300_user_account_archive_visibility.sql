begin;

alter table public.user_profiles
add column if not exists archived_at timestamptz;

comment on column public.user_profiles.archived_at is
  'Set by safe account deletion. Archived accounts stay linked to historical records but are hidden from active management lists.';

with deleted_accounts as (
  select
    case
      when entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then entity_id::uuid
      else null
    end as user_id,
    max(created_at) as archived_at
  from public.activity_log
  where action = 'delete'
    and entity_type = 'user_profiles'
  group by entity_id
)
update public.user_profiles profile
set archived_at = deleted.archived_at
from deleted_accounts deleted
where profile.id = deleted.user_id
  and profile.archived_at is null;

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

  if v_target.archived_at is not null and p_action <> 'delete' then
    raise exception using errcode = 'P0001', message = 'Ein gelöschtes Konto kann nicht erneut aktiviert oder geändert werden.';
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
  set disabled = true,
      archived_at = case
        when p_action = 'delete' then coalesce(archived_at, clock_timestamp())
        else archived_at
      end
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

commit;
