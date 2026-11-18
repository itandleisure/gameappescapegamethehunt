-- Telefoonnummer bij het aanmelden van een team, en de teamfoto.
--
-- Het telefoonnummer staat in een eigen tabel: andere teams in de sessie zien
-- de teams (voor de ranglijst), maar nooit elkaars telefoonnummer. Alleen het
-- team zelf en de spelleiding lezen het.
--
-- De teamfoto gaat als gewone foto naar de bucket photos, met als
-- opdrachtsleutel "_team" (een echte opdrachtsleutel begint nooit met _).

create table public.team_contacts (
  team_id uuid primary key references public.teams (id) on delete cascade,
  phone text not null check (phone ~ '^\+?[0-9][0-9 ()-]{6,22}[0-9]$'),
  created_at timestamptz not null default now()
);
alter table public.team_contacts enable row level security;
create policy team_contacts_select on public.team_contacts for select to authenticated
  using (public.is_team_member(team_id) or public.can_watch_session(public.team_session(team_id)));
create policy team_contacts_update_staff on public.team_contacts for update to authenticated
  using (public.can_run_session(public.team_session(team_id)));
grant select, update on public.team_contacts to authenticated;

-- join_session met telefoonnummer. Oudere app-versies (zonder nummer) blijven
-- werken; de app maakt het nummer verplicht.
drop function public.join_session(text, text, text);
create function public.join_session(p_join_code text, p_team_name text, p_language text, p_phone text default null)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_session public.sessions;
  v_package jsonb;
  v_order integer;
  v_team public.teams;
  v_code text;
  v_phone text := nullif(regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '28000';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 ()-]{6,22}[0-9]$' then
    raise exception 'ongeldig telefoonnummer' using errcode = '22023';
  end if;

  select * into v_session from public.sessions
  where join_code = upper(trim(p_join_code))
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'onbekende of gesloten sessie' using errcode = 'P0002';
  end if;

  select package into v_package from public.game_versions where id = v_session.game_version_id;
  if not (v_package -> 'languages') ? p_language then
    raise exception 'taal % niet beschikbaar', p_language using errcode = '22023';
  end if;

  select coalesce(max(login_order), 0) + 1 into v_order from public.teams where session_id = v_session.id;

  loop
    v_code := public.random_code(6);
    exit when not exists (select 1 from public.teams where team_code = v_code);
  end loop;

  insert into public.teams (session_id, name, language, login_order, track, team_code)
  values (v_session.id, trim(p_team_name), p_language, v_order, ((v_order - 1) % v_session.track_count) + 1, v_code)
  returning * into v_team;

  insert into public.team_members (team_id, user_id) values (v_team.id, auth.uid());
  if v_phone is not null then
    insert into public.team_contacts (team_id, phone) values (v_team.id, v_phone);
  end if;
  return v_team;
end;
$$;

revoke execute on function public.join_session(text, text, text, text) from public, anon;
grant execute on function public.join_session(text, text, text, text) to authenticated;
