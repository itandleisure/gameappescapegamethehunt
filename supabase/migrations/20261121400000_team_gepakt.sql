-- =============================================================================
-- Team gepakt: strafpunten en een melding voor de teams
--
-- De spelleider meldt in de app (of het beheer) dat een Hunter een team heeft
-- gepakt. Tot nu toe was dat alleen een teller (teams.caught). Nu:
--
-- - Elke keer gepakt wordt ook een gebeurtenis 'caught' met strafpunten
--   (GamePackage.caughtPenalty, standaard 100). Zo telt de straf mee in de
--   score, overal waar de score uit de gebeurtenissen wordt berekend. Min op de
--   teller (vergissing) haalt de laatste weer weg.
-- - Teams mogen zelf geen 'caught' insturen.
-- - team_signals: wat een spelend team elke 10 seconden vraagt. Of er een
--   Hunter in de buurt is (hunter_nearby) en welke teams sinds p_since gepakt
--   zijn, zodat de app kan trillen en "Team gepakt" kan tonen.
-- =============================================================================

drop policy events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (
  (public.is_team_member(team_id) and type not in ('manualOpen', 'caught'))
  or public.can_run_session(public.team_session(team_id))
);

-- Gebeurtenis bij de teller: +1 voegt een 'caught' toe, -1 haalt de laatste weg.
create function public.record_caught(p_team uuid, p_delta integer)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_penalty integer;
begin
  if p_delta = 1 then
    select coalesce(round((v.package ->> 'caughtPenalty')::numeric)::integer, 100) into v_penalty
      from public.teams t
      join public.sessions s on s.id = t.session_id
      join public.game_versions v on v.id = s.game_version_id
     where t.id = p_team;
    insert into public.events (id, team_id, type, task_key, payload, client_time)
    values (gen_random_uuid(), p_team, 'caught', null,
            jsonb_build_object('points', -abs(coalesce(v_penalty, 100))), now());
  elsif p_delta = -1 then
    delete from public.events
     where id = (select id from public.events
                  where team_id = p_team and type = 'caught'
                  order by server_time desc, id desc limit 1);
  end if;
end;
$$;
revoke execute on function public.record_caught(uuid, integer) from public, anon, authenticated;

-- Spelleider in de app.
create or replace function public.leader_bump_caught(p_session uuid, p_team uuid, p_delta integer)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_old integer;
  v_caught integer;
begin
  perform public.require_session_leader(p_session);
  if p_delta not in (-1, 1) then
    raise exception 'delta moet 1 of -1 zijn' using errcode = '22023';
  end if;
  select caught into v_old from public.teams where id = p_team and session_id = p_session for update;
  if not found then
    raise exception 'team niet gevonden' using errcode = 'P0002';
  end if;
  update public.teams set caught = greatest(0, caught + p_delta)
   where id = p_team
   returning caught into v_caught;
  if v_caught <> v_old then
    perform public.record_caught(p_team, p_delta);
  end if;
  return v_caught;
end;
$$;

-- Spelleiding in het beheer (ranglijst).
create or replace function public.bump_team_caught(p_team uuid, p_delta integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_old integer;
  v_caught integer;
begin
  if p_delta not in (-1, 1) then
    raise exception 'delta moet 1 of -1 zijn';
  end if;
  if not public.is_member(public.session_org(public.team_session(p_team))) then
    raise exception 'geen toegang tot dit team' using errcode = '42501';
  end if;
  select caught into v_old from public.teams where id = p_team for update;
  update public.teams set caught = greatest(0, caught + p_delta)
   where id = p_team
   returning caught into v_caught;
  if v_caught <> v_old then
    perform public.record_caught(p_team, p_delta);
  end if;
  return v_caught;
end;
$$;

-- Wat een spelend team elke 10 seconden vraagt. p_since: servertijd in ms;
-- alleen teams die daarna gepakt zijn (hooguit de laatste 20).
create function public.team_signals(p_team uuid, p_since double precision default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session uuid;
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  select session_id into v_session from public.teams where id = p_team;
  return jsonb_build_object(
    'hunter_near', public.hunter_nearby(p_team),
    'caught', coalesce((
      select jsonb_agg(c order by c.at)
      from (
        select e.id, e.team_id, t.name as team_name, (e.payload ->> 'points')::numeric as points,
               floor(extract(epoch from e.server_time) * 1000)::bigint as at
          from public.events e join public.teams t on t.id = e.team_id
         where t.session_id = v_session and e.type = 'caught'
           and floor(extract(epoch from e.server_time) * 1000) > coalesce(p_since, 0)
         order by e.server_time desc
         limit 20
      ) c
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.team_signals(uuid, double precision) from public, anon;
grant execute on function public.team_signals(uuid, double precision) to authenticated;
