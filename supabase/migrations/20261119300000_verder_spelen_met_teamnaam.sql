-- Verder spelen met de hunt-code en de teamnaam in plaats van een losse teamcode.
--
-- Een team onthoudt zijn eigen naam en de hunt-code van de spelleiding veel
-- makkelijker dan een code als "K7QX2M". Daarom mag elke teamnaam maar één keer
-- voorkomen in een hunt. Hoofdletters, spaties en leestekens tellen niet mee:
-- "De Winnaars!" en "de winnaars" zijn dezelfde naam.
--
-- De teamcode blijft bestaan (voor oudere versies van de app en de beheeromgeving).

create function public.normalize_team_name(p_name text)
returns text
language sql immutable set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_name, '')), '[^[:alnum:]]', '', 'g');
$$;

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

-- Verder spelen op een andere telefoon met hunt-code + teamnaam. Werkt ook als
-- de hunt vergrendeld of al gestart is, zolang hij open staat.
create function public.rejoin_team_by_name(p_join_code text, p_team_name text)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_team public.teams;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '28000';
  end if;
  select t.* into v_team from public.teams t join public.sessions s on s.id = t.session_id
  where s.join_code = upper(trim(p_join_code))
    and s.status = 'open'
    and public.normalize_team_name(t.name) = public.normalize_team_name(p_team_name)
    and public.normalize_team_name(p_team_name) <> ''
  order by t.login_order
  limit 1;
  if not found then
    raise exception 'onbekend team' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id) values (v_team.id, auth.uid()) on conflict do nothing;
  return v_team;
end;
$$;

revoke execute on function public.rejoin_team_by_name(text, text) from public, anon;
grant execute on function public.rejoin_team_by_name(text, text) to authenticated;
revoke execute on function public.normalize_team_name(text) from public, anon;
grant execute on function public.normalize_team_name(text) to authenticated;
