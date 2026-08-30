do $$
begin
  if (select count(*) from public.expenses where sequence_year=2026) <> 4
    or (select count(distinct sequence_number) from public.expenses where sequence_year=2026) <> 4
    or (select max(sequence_number) from public.expenses where sequence_year=2026) <> 4 then
    raise exception 'Concurrent numbering did not produce four unique sequential values';
  end if;
end;
$$;
