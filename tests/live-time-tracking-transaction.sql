begin;

do $test$
declare
  v_employee_id uuid := gen_random_uuid();
  v_site_id uuid := gen_random_uuid();
  v_shift_id uuid := gen_random_uuid();
  v_entry_id uuid;
  v_today date := (clock_timestamp() at time zone 'Europe/Berlin')::date;
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_employee_id,
    'authenticated',
    'authenticated',
    'codex-rollback-test@example.invalid',
    '',
    clock_timestamp(),
    '{}'::jsonb,
    '{}'::jsonb,
    clock_timestamp(),
    clock_timestamp()
  );

  insert into public.user_profiles (id, email, display_name, role)
  values (v_employee_id, 'codex-rollback-test@example.invalid', 'Rollback Test', 'employee');

  insert into public.employees (id, employee_number)
  values (v_employee_id, 'ROLLBACK-TEST');

  insert into public.work_sites (id, code, name)
  values (v_site_id, 'ROLLBACK-SITE', 'Rollback Site');

  insert into public.employee_work_sites (
    employee_id,
    work_site_id,
    is_primary,
    valid_from
  ) values (v_employee_id, v_site_id, true, v_today);

  insert into public.work_shifts (
    id,
    employee_id,
    work_site_id,
    scheduled_start,
    scheduled_end
  ) values (
    v_shift_id,
    v_employee_id,
    v_site_id,
    clock_timestamp() - interval '1 hour',
    clock_timestamp() + interval '7 hours'
  );

  perform set_config('request.jwt.claim.sub', v_employee_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select result.entry_id into v_entry_id
  from public.record_time_event(
    'start',
    gen_random_uuid(),
    v_site_id,
    v_shift_id,
    'transactional live test'
  ) result;

  perform * from public.record_time_event('pause', gen_random_uuid(), null, null, null);
  perform * from public.record_time_event('resume', gen_random_uuid(), null, null, null);
  perform * from public.record_time_event('end', gen_random_uuid(), null, null, null);

  if not exists (
    select 1
    from public.time_entries entry
    where entry.id = v_entry_id
      and entry.status = 'completed'
      and entry.ended_at is not null
  ) then
    raise exception 'Clock transition test did not complete the time entry.';
  end if;

  if (select count(*) from public.time_entry_events event where event.time_entry_id = v_entry_id) <> 4 then
    raise exception 'Clock transition test did not persist exactly four events.';
  end if;

  if not exists (
    select 1
    from public.time_breaks break_row
    where break_row.time_entry_id = v_entry_id
      and break_row.ended_at is not null
  ) then
    raise exception 'Clock transition test did not close the break.';
  end if;

  insert into public.employee_absences (
    employee_id,
    absence_type,
    start_date,
    end_date,
    approval_status
  ) values (v_employee_id, 'vacation', v_today, v_today, 'approved');

  begin
    perform *
    from public.record_time_event('start', gen_random_uuid(), v_site_id, null, null);
    raise exception 'Approved absence unexpectedly allowed a work session.';
  exception
    when sqlstate '55000' then null;
  end;
end;
$test$;

rollback;

select 'passed' as transactional_time_tracking_test;
