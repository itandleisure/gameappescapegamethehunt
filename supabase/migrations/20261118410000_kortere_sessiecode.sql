-- Kortere sessiecode: 5 tekens zonder letters die op cijfers lijken. Een
-- eigen code (4 tot 12 letters of cijfers, zoals HUNT1) kan ook.
create or replace function public.sessions_join_code()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.join_code is null or new.join_code = '' then
    loop
      new.join_code := public.random_code(5);
      exit when not exists (select 1 from public.sessions where join_code = new.join_code);
    end loop;
  else
    new.join_code := upper(trim(new.join_code));
  end if;
  return new;
end;
$$;
