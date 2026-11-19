-- =============================================================================
-- Lopende hunts live bijwerken (zoals "Update live players" bij Loquiz)
--
-- Zit er tijdens een spel een fout in de spelinhoud, dan past de beheerder het
-- spel aan, publiceert opnieuw en zet de hunts die nog open staan over op die
-- nieuwe versie. De app van elk team ziet dat binnen een halve minuut, laadt
-- de nieuwe versie en meldt "Spel bijgewerkt". De voortgang blijft: de app
-- bewaart alleen wat het team deed (gebeurtenissen) en rekent de stand
-- opnieuw uit met de nieuwe versie.
--
-- * Het spelpakket krijgt bij publiceren een tijdstip (publishedAt). Een
--   aankomst op een locatie van vóór dat moment telt dan gewoon mee, ook als
--   de locatie in de nieuwe versie verplaatst is.
-- * update_live_sessions(versie): zet alle open hunts van hetzelfde spel die
--   op een oudere versie spelen over op deze versie. Ook hunts van partners
--   die dit spel spelen: de maker van het spel herstelt de fout voor iedereen.
-- * live_sessions_summary(spel): hoeveel open hunts en spelende teams een
--   volgende publicatie zou bijwerken, voor de vraag in het beheer.
-- =============================================================================

-- Wanneer een hunt voor het laatst live is bijgewerkt (voor het beheer).
alter table public.sessions add column if not exists game_updated_at timestamptz;

-- Publiceren: zelfde als voorheen, plus het tijdstip van publiceren (ms).
create or replace function public.publish_game_version(p_game uuid, p_package jsonb)
returns public.game_versions
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_version public.game_versions;
  v_next integer;
begin
  perform 1 from public.games where id = p_game for update;
  if not found or not public.can_edit_game(p_game) then
    raise exception 'geen rechten om dit spel te publiceren' using errcode = '42501';
  end if;
  if jsonb_typeof(p_package) <> 'object'
     or jsonb_typeof(p_package -> 'tasks') <> 'array'
     or jsonb_typeof(p_package -> 'languages') <> 'array'
     or not (p_package -> 'languages') ? (p_package ->> 'defaultLanguage') then
    raise exception 'ongeldig spelpakket' using errcode = '22023';
  end if;

  v_next := coalesce((select max(version) from public.game_versions where game_id = p_game), 0) + 1;
  insert into public.game_versions (game_id, version, package, published_by)
  values (
    p_game,
    v_next,
    jsonb_set(
      jsonb_set(p_package, '{version}', to_jsonb(v_next)),
      '{publishedAt}', to_jsonb((extract(epoch from clock_timestamp()) * 1000)::bigint)
    ),
    auth.uid()
  )
  returning * into v_version;
  return v_version;
end;
$$;

-- Open hunts van dit spel die op een oudere versie spelen.
create or replace function public.live_sessions_of(p_game uuid, p_below integer)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select s.id
  from public.sessions s
  join public.game_versions v on v.id = s.game_version_id
  where v.game_id = p_game
    and v.version < p_below
    and s.status <> 'closed'
    and s.anonymized_at is null
$$;
revoke execute on function public.live_sessions_of(uuid, integer) from public, anon, authenticated;

-- Voor de vraag in het beheer: hoeveel open hunts en spelende teams.
create or replace function public.live_sessions_summary(p_game uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_latest integer;
begin
  if not public.can_edit_game(p_game) then
    raise exception 'geen rechten voor dit spel' using errcode = '42501';
  end if;
  select max(version) into v_latest from public.game_versions where game_id = p_game;
  return (
    select jsonb_build_object(
      'sessions', count(distinct s.id),
      'teams', count(t.id) filter (where t.started_at is not null and t.ended_at is null)
    )
    from public.sessions s
    left join public.teams t on t.session_id = s.id
    where s.id in (select public.live_sessions_of(p_game, coalesce(v_latest, 0) + 1))
  );
end;
$$;
grant execute on function public.live_sessions_summary(uuid) to authenticated;

-- Zet de open hunts van het spel over op deze (nieuwere) versie. Geeft het
-- aantal bijgewerkte hunts terug.
create or replace function public.update_live_sessions(p_version uuid)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v public.game_versions;
  v_count integer;
begin
  select * into v from public.game_versions where id = p_version;
  if not found or not public.can_edit_game(v.game_id) then
    raise exception 'geen rechten om dit spel bij te werken' using errcode = '42501';
  end if;
  update public.sessions
  set game_version_id = v.id, game_updated_at = now()
  where id in (select public.live_sessions_of(v.game_id, v.version));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.update_live_sessions(uuid) to authenticated;
