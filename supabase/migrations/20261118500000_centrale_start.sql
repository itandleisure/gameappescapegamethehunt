-- Centrale start door de spelleider.
--
-- 1. De spelleider vergrendelt de hunt als alle teams zijn aangemeld: daarna
--    geen nieuwe teams meer (bestaande teams kunnen met hun teamcode altijd
--    opnieuw inloggen, bijvoorbeeld op een andere telefoon).
-- 2. Teams lezen de speluitleg en melden zich klaar (teams.ready_at).
-- 3. De spelleider start het spel: de speeltijd van alle teams begint op
--    hetzelfde moment (sessions.started_at).

alter table public.sessions
  add column central_start boolean not null default false,
  add column locked boolean not null default false,
  add column started_at timestamptz;

alter table public.teams add column ready_at timestamptz;

create or replace function public.join_session(p_join_code text, p_team_name text, p_language text, p_phone text default null)
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
  -- Vergrendeld of al gestart: geen nieuwe teams meer. Bestaande teams komen
  -- binnen met hun teamcode (rejoin_team), dat blijft altijd werken.
  if v_session.locked or v_session.started_at is not null then
    raise exception 'hunt is vergrendeld' using errcode = 'P0003';
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


-- Speeltijd starten. Bij een centrale start pas als de spelleider de hunt
-- heeft gestart; het team krijgt dan precies dezelfde starttijd.
create or replace function public.start_team(p_team uuid)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_team public.teams;
  v_session public.sessions;
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  select s.* into v_session from public.sessions s join public.teams t on t.session_id = s.id where t.id = p_team;
  if v_session.central_start and v_session.started_at is null then
    raise exception 'wacht op de start door de spelleider' using errcode = 'P0004';
  end if;
  update public.teams
  set started_at = coalesce(started_at, case when v_session.central_start then v_session.started_at else now() end)
  where id = p_team
  returning * into v_team;
  return v_team;
end;
$$;

-- Team meldt dat het de speluitleg heeft gelezen.
create function public.team_ready(p_team uuid)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_team public.teams;
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  update public.teams set ready_at = coalesce(ready_at, now()) where id = p_team returning * into v_team;
  return v_team;
end;
$$;

-- De spelleider start het spel voor alle teams tegelijk (eenmalig). De hunt
-- wordt daarbij ook vergrendeld.
create function public.start_session(p_session uuid)
returns public.sessions
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  if not public.can_run_session(p_session) then
    raise exception 'geen toegang tot deze hunt' using errcode = '42501';
  end if;
  update public.sessions
  set started_at = coalesce(started_at, now()), locked = true
  where id = p_session
  returning * into v_session;
  if v_session.status <> 'open' then
    raise exception 'hunt is niet open' using errcode = 'P0002';
  end if;
  update public.teams set started_at = coalesce(started_at, v_session.started_at) where session_id = p_session;
  return v_session;
end;
$$;

revoke execute on function public.join_session(text, text, text, text) from public, anon;
grant execute on function public.join_session(text, text, text, text) to authenticated;
revoke execute on function public.start_team(uuid), public.team_ready(uuid), public.start_session(uuid) from public, anon;
grant execute on function public.start_team(uuid), public.team_ready(uuid), public.start_session(uuid) to authenticated;
