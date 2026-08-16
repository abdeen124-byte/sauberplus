begin;

create or replace function public.submit_manual_time_entry(
  p_request_id uuid,
  p_work_site_id uuid,
  p_work_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_break_minutes integer default 0,
  p_note text default null,
  p_signature_data_url text default null
)
returns table (
  entry_id uuid,
  employee_id uuid,
  work_site_id uuid,
  work_date date,
  started_at timestamptz,
  ended_at timestamptz,
  entry_status text,
  break_seconds bigint,
  worked_seconds bigint,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_timezone_name text;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_shift_minutes integer;
  v_break_minutes integer := coalesce(p_break_minutes, 0);
  v_note text := btrim(coalesce(p_note, ''));
  v_signature text := coalesce(p_signature_data_url, '');
  v_entry public.time_entries%rowtype;
  v_existing_event public.time_entry_events%rowtype;
begin
  if v_employee_id is null or p_request_id is null then
    raise exception using errcode = '23502', message = 'Authentication and request id are required.';
  end if;

  if p_work_site_id is null or p_work_date is null or p_start_time is null or p_end_time is null then
    raise exception using errcode = '23502', message = 'Work site, date, start and end are required.';
  end if;

  if char_length(v_note) > 1000 then
    raise exception using errcode = '22001', message = 'The work note is too long.';
  end if;

  if v_break_minutes < 0 or v_break_minutes > 240 then
    raise exception using errcode = '22023', message = 'Break minutes must be between 0 and 240.';
  end if;

  if char_length(v_signature) < 100
    or char_length(v_signature) > 500000
    or left(v_signature, 22) <> 'data:image/png;base64,' then
    raise exception using errcode = '22023', message = 'A valid PNG signature is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_employee_id::text, 0));

  select event.*
    into v_existing_event
  from public.time_entry_events event
  where event.employee_id = v_employee_id
    and event.request_id = p_request_id;

  if v_existing_event.id is not null then
    if v_existing_event.event_type <> 'end'
      or v_existing_event.metadata ->> 'submission_mode' <> 'manual' then
      raise exception using errcode = '23505', message = 'The request id was already used for another action.';
    end if;

    return query
    select
      totals.id,
      totals.employee_id,
      totals.work_site_id,
      totals.work_date,
      totals.started_at,
      totals.ended_at,
      totals.status,
      totals.break_seconds,
      totals.worked_seconds,
      v_now
    from public.time_entry_totals totals
    where totals.id = v_existing_event.time_entry_id;
    return;
  end if;

  select site.timezone_name
    into v_timezone_name
  from public.work_sites site
  where site.id = p_work_site_id
    and site.active = true;

  if v_timezone_name is null then
    raise exception using errcode = '22023', message = 'The selected work site is unavailable.';
  end if;

  perform 1
  from public.user_profiles profile
  join public.employees employee on employee.id = profile.id
  where profile.id = v_employee_id
    and profile.role = 'employee'
    and profile.disabled = false
    and (employee.employment_start_date is null or employee.employment_start_date <= p_work_date)
    and (employee.employment_end_date is null or employee.employment_end_date >= p_work_date)
  for update of profile, employee;

  if not found then
    raise exception using errcode = '42501', message = 'Employee account is not active for the selected date.';
  end if;

  if p_work_date > (v_now at time zone v_timezone_name)::date then
    raise exception using errcode = '22023', message = 'A future work date is not permitted.';
  end if;

  if not exists (
    select 1
    from public.employee_work_sites assignment
    where assignment.employee_id = v_employee_id
      and assignment.work_site_id = p_work_site_id
      and (assignment.valid_from is null or assignment.valid_from <= p_work_date)
      and (assignment.valid_until is null or assignment.valid_until >= p_work_date)
  ) and not exists (
    select 1
    from public.work_shifts shift
    where shift.employee_id = v_employee_id
      and shift.work_site_id = p_work_site_id
      and shift.status = 'scheduled'
      and (shift.scheduled_start at time zone v_timezone_name)::date = p_work_date
  ) then
    raise exception using errcode = '42501', message = 'The employee is not assigned to this work site for the selected date.';
  end if;

  if exists (
    select 1
    from public.employee_absences absence
    where absence.employee_id = v_employee_id
      and absence.approval_status = 'approved'
      and absence.start_date <= p_work_date
      and absence.end_date >= p_work_date
  ) then
    raise exception using errcode = '55000', message = 'Time tracking is unavailable during an approved absence.';
  end if;

  v_started_at := (p_work_date + p_start_time) at time zone v_timezone_name;
  v_ended_at := (
    p_work_date
    + case when p_end_time <= p_start_time then 1 else 0 end
    + p_end_time
  ) at time zone v_timezone_name;
  v_shift_minutes := floor(extract(epoch from (v_ended_at - v_started_at)) / 60)::integer;

  if v_shift_minutes <= 0 or v_shift_minutes > 960 or v_break_minutes >= v_shift_minutes then
    raise exception using errcode = '22023', message = 'The submitted shift duration is invalid.';
  end if;

  if exists (
    select 1
    from public.time_entries existing
    where existing.employee_id = v_employee_id
      and existing.status in ('working', 'paused')
  ) then
    raise exception using errcode = '23505', message = 'An active work session already exists.';
  end if;

  if exists (
    select 1
    from public.time_entries existing
    where existing.employee_id = v_employee_id
      and existing.started_at < v_ended_at
      and coalesce(existing.ended_at, 'infinity'::timestamptz) > v_started_at
  ) then
    raise exception using errcode = '23P01', message = 'The submitted shift overlaps an existing entry.';
  end if;

  insert into public.time_entries (
    employee_id,
    work_site_id,
    work_date,
    started_at,
    ended_at,
    status,
    note,
    created_by,
    updated_by
  ) values (
    v_employee_id,
    p_work_site_id,
    p_work_date,
    v_started_at,
    v_ended_at,
    'completed',
    v_note,
    v_employee_id,
    v_employee_id
  )
  returning * into v_entry;

  if v_break_minutes > 0 then
    insert into public.time_breaks (
      time_entry_id,
      started_at,
      ended_at,
      created_by,
      updated_by
    ) values (
      v_entry.id,
      v_ended_at - make_interval(mins => v_break_minutes),
      v_ended_at,
      v_employee_id,
      v_employee_id
    );
  end if;

  insert into public.time_entry_events (
    time_entry_id,
    employee_id,
    request_id,
    event_type,
    recorded_at,
    actor_user_id,
    metadata
  ) values (
    v_entry.id,
    v_employee_id,
    p_request_id,
    'end',
    v_now,
    v_employee_id,
    jsonb_build_object(
      'submission_mode', 'manual',
      'confirmed', true,
      'signature_data_url', v_signature,
      'break_minutes', v_break_minutes
    )
  );

  return query
  select
    totals.id,
    totals.employee_id,
    totals.work_site_id,
    totals.work_date,
    totals.started_at,
    totals.ended_at,
    totals.status,
    totals.break_seconds,
    totals.worked_seconds,
    v_now
  from public.time_entry_totals totals
  where totals.id = v_entry.id;
end;
$$;

revoke execute on function public.submit_manual_time_entry(uuid, uuid, date, time without time zone, time without time zone, integer, text, text)
  from public, anon;
grant execute on function public.submit_manual_time_entry(uuid, uuid, date, time without time zone, time without time zone, integer, text, text)
  to authenticated;

commit;
