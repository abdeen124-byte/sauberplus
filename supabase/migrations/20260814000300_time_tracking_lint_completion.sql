begin;

-- The paused -> Ende branch is indented one level deeper than the resume
-- branch corrected previously. Qualify that second update as well.
do $migration$
declare
  v_signature regprocedure :=
    'public.record_time_event(text,uuid,uuid,uuid,text)'::regprocedure;
  v_original text;
  v_corrected text;
begin
  select pg_get_functiondef(v_signature) into v_original;

  v_corrected := replace(
    v_original,
    E'update public.time_breaks\n        set ended_at = v_now, updated_by = v_employee_id\n        where time_entry_id = v_entry.id and ended_at is null;',
    E'update public.time_breaks as open_break\n        set ended_at = v_now, updated_by = v_employee_id\n        where open_break.time_entry_id = v_entry.id and open_break.ended_at is null;'
  );

  if v_corrected = v_original then
    raise exception using
      errcode = 'P0001',
      message = 'record_time_event paused-end update could not be qualified safely.';
  end if;

  execute v_corrected;
end;
$migration$;

-- p_email remains in this legacy public signature for backward compatibility,
-- but identity is derived exclusively from auth.uid(). Referencing it without
-- using it for lookup keeps plpgsql_check free of a misleading unused warning.
do $migration$
declare
  v_signature regprocedure :=
    'public.register_successful_login(text)'::regprocedure;
  v_original text;
  v_corrected text;
begin
  select pg_get_functiondef(v_signature) into v_original;

  v_corrected := replace(
    v_original,
    E'begin\n  if v_user_id is null then',
    E'begin\n  perform p_email;\n\n  if v_user_id is null then'
  );

  if v_corrected = v_original then
    raise exception using
      errcode = 'P0001',
      message = 'register_successful_login compatibility parameter could not be marked safely.';
  end if;

  execute v_corrected;
end;
$migration$;

commit;
