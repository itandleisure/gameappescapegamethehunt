-- Maximaal aantal teams per ticket.
--
-- Een ticket (sessie) kan onbeperkt teams hebben (max_teams leeg, zoals tot nu
-- toe), of een maximum: koopt een groep van 20 via de webshop 4 teams, dan
-- mogen er met die spelcode maar 4 teams inloggen. Het 5e team krijgt een
-- duidelijke melding (errcode P0007). Teams die al meedoen komen altijd weer
-- binnen (rejoin_team, rejoin_team_by_name): dat telt niet als nieuw team.
-- Spelleiders hebben hun eigen maximum (max_leaders, standaard 20).

alter table public.sessions
  add column max_teams integer check (max_teams between 1 and 500);

comment on column public.sessions.max_teams is
  'Maximaal aantal teams dat met de spelcode mag inloggen; leeg = onbeperkt.';

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

  -- Elke teamnaam maar één keer per hunt: met hunt-code + teamnaam komt het
  -- team later (of op een andere telefoon) weer binnen.
  if exists (
    select 1 from public.teams
    where session_id = v_session.id and public.normalize_team_name(name) = public.normalize_team_name(p_team_name)
  ) then
    raise exception 'teamnaam bestaat al in deze hunt' using errcode = '23505';
  end if;

  -- Ticket vol: het maximum aantal teams doet al mee. De sessie staat
  -- vergrendeld (for update), dus twee teams tegelijk kunnen er niet langs.
  if v_session.max_teams is not null
     and (select count(*) from public.teams where session_id = v_session.id) >= v_session.max_teams then
    raise exception 'ticket vol: maximaal % teams', v_session.max_teams using errcode = 'P0007';
  end if;

  select coalesce(max(login_order), 0) + 1 into v_order from public.teams where session_id = v_session.id;

  v_code := public.new_team_code();

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
