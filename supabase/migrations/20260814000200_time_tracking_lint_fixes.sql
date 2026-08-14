begin;

-- PostgreSQL treats the RETURNS TABLE column `ended_at` as a PL/pgSQL
-- variable. Qualify the target relation in both break-closing branches so
-- Pause -> Fortsetzen and Pause -> Ende compile without ambiguity. Building
-- from pg_get_functiondef keeps this corrective migration small while still
-- preserving the exact, already-reviewed transition function.
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
    E'update public.time_breaks\n      set ended_at = v_now, updated_by = v_employee_id\n      where time_entry_id = v_entry.id and ended_at is null;',
    E'update public.time_breaks as open_break\n      set ended_at = v_now, updated_by = v_employee_id\n      where open_break.time_entry_id = v_entry.id and open_break.ended_at is null;'
  );

  if v_corrected = v_original then
    raise exception using
      errcode = 'P0001',
      message = 'record_time_event break updates could not be qualified safely.';
  end if;

  execute v_corrected;
end;
$migration$;

-- Both functions read clock_timestamp(), directly or through
-- time_entry_totals, so VOLATILE is the truthful planner contract.
alter function public.get_my_time_state() volatile;
alter function public.get_time_summary(uuid, date, date, text, uuid) volatile;

commit;
