-- Aantal keren gepakt per team. De hunters pakken teams op straat; de
-- spelleider houdt dat bij in de ranglijst met een plus en een min. Samen
-- met de score en de opgeloste puzzels bepaalt de spelleiding zo de winnaar.

alter table public.teams add column caught integer not null default 0 check (caught >= 0);

-- Optellen of aftrekken in één stap, zodat twee spelleiders tegelijk kunnen
-- tikken zonder elkaars tik te overschrijven. Nooit onder nul.
create function public.bump_team_caught(p_team uuid, p_delta integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_caught integer;
begin
  if p_delta not in (-1, 1) then
    raise exception 'delta moet 1 of -1 zijn';
  end if;
  if not public.can_run_session(public.team_session(p_team)) then
    raise exception 'geen toegang tot dit team' using errcode = '42501';
  end if;
  update public.teams set caught = greatest(0, caught + p_delta)
   where id = p_team
   returning caught into v_caught;
  return v_caught;
end;
$$;

revoke execute on function public.bump_team_caught(uuid, integer) from public, anon;
grant execute on function public.bump_team_caught(uuid, integer) to authenticated;
