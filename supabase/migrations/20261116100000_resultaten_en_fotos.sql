-- =============================================================================
-- Resultaten, live kaart en fotorol
--
-- - Foto's uit de fotomissie gaan automatisch naar de opslag (bucket "photos").
-- - session_results(): ranglijst met speeltijd, totaalafstand, punten en foto's,
--   voor de resultatenpagina van de spelleiding en de app.
-- - shared_session_results(): dezelfde gegevens via een geheime link, voor de
--   klant en voor de export naar het fotoboek.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Deelbare resultaten
-- -----------------------------------------------------------------------------

alter table public.sessions
  add column results_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  add column results_shared boolean not null default false;

-- Nieuwe geheime link, bijvoorbeeld als de oude te ver is verspreid.
create function public.rotate_results_token(p_session uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  if not public.can_run_session(p_session) then
    raise exception 'geen toegang tot deze sessie' using errcode = '42501';
  end if;
  update public.sessions set results_token = v_token where id = p_session;
  return v_token;
end;
$$;

-- -----------------------------------------------------------------------------
-- Foto's in de opslag: pad <team_id>/<opdracht>/<bestand>
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy photos_upload_team on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and public.is_team_member(((storage.foldername(name))[1])::uuid)
);

create policy photos_read on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    public.plays_in_session(public.team_session(((storage.foldername(name))[1])::uuid))
    or public.can_run_session(public.team_session(((storage.foldername(name))[1])::uuid))
  )
);

-- -----------------------------------------------------------------------------
-- Totaalafstand: zelfde regels als routeDistance() in @hunt/engine.
-- Onnauwkeurige metingen (> 30 m), stilstaan (< 5 m) en sprongen (> 8 m/s) tellen niet.
-- -----------------------------------------------------------------------------

create function public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable parallel safe
as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  )));
$$;

create function public.team_distance(p_team uuid, p_from timestamptz default null, p_to timestamptz default null)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  p record;
  a_lat double precision;
  a_lng double precision;
  prev_at timestamptz;
  step double precision;
  seconds double precision;
  total double precision := 0;
begin
  for p in
    select lat, lng, recorded_at from public.positions
    where team_id = p_team and accuracy <= 30
      and (p_from is null or recorded_at >= p_from)
      and (p_to is null or recorded_at <= p_to)
    order by recorded_at
  loop
    if a_lat is null then
      a_lat := p.lat; a_lng := p.lng; prev_at := p.recorded_at;
      continue;
    end if;
    step := public.haversine_m(a_lat, a_lng, p.lat, p.lng);
    seconds := extract(epoch from p.recorded_at - prev_at);
    prev_at := p.recorded_at;
    if step < 5 or seconds <= 0 or step / seconds > 8 then
      continue;
    end if;
    total := total + step;
    a_lat := p.lat; a_lng := p.lng;
  end loop;
  return round(total)::integer;
end;
$$;

-- -----------------------------------------------------------------------------
-- Resultaten per sessie
-- -----------------------------------------------------------------------------

create function public.build_session_results(p_session uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with t as (
    select
      tm.id, tm.name, tm.track, tm.language, tm.score, tm.outcome, tm.started_at, tm.ended_at,
      case when tm.started_at is null then null
           else extract(epoch from coalesce(tm.ended_at, now()) - tm.started_at)::integer end as duration_seconds,
      public.team_distance(tm.id, tm.started_at, tm.ended_at) as distance_m,
      coalesce((
        select jsonb_agg(jsonb_build_object('task', ph.task_key, 'path', ph.path, 'taken_at', ph.created_at) order by ph.created_at)
        from public.photos ph where ph.team_id = tm.id
      ), '[]'::jsonb) as photos
    from public.teams tm
    where tm.session_id = p_session
  ), ranked as (
    select t.*, rank() over (order by score desc, duration_seconds asc nulls last) as rank from t
  )
  select jsonb_build_object(
    'session', (
      select jsonb_build_object('id', s.id, 'name', s.name, 'starts_at', s.starts_at, 'status', s.status, 'test_mode', s.test_mode,
                                'organization', o.name, 'logo_path', o.logo_path)
      from public.sessions s join public.organizations o on o.id = s.org_id where s.id = p_session
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', r.rank, 'id', r.id, 'name', r.name, 'track', r.track, 'language', r.language,
        'score', r.score, 'outcome', r.outcome, 'started_at', r.started_at, 'ended_at', r.ended_at,
        'duration_seconds', r.duration_seconds, 'distance_m', r.distance_m, 'photos', r.photos
      ) order by r.rank, r.name)
      from ranked r
    ), '[]'::jsonb)
  );
$$;

-- Voor de spelleiding en voor spelers in de sessie.
create function public.session_results(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.can_run_session(p_session) or public.plays_in_session(p_session)) then
    raise exception 'geen toegang tot deze sessie' using errcode = '42501';
  end if;
  return public.build_session_results(p_session);
end;
$$;

-- Via de geheime link: werkt zonder inloggen, alleen als delen aan staat.
create function public.shared_session_results(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session uuid;
begin
  select id into v_session from public.sessions
  where results_token = p_token and results_shared and length(p_token) >= 24;
  if v_session is null then
    raise exception 'onbekende of niet gedeelde resultaten' using errcode = 'P0002';
  end if;
  return public.build_session_results(v_session);
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.build_session_results(uuid), public.team_distance(uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.shared_session_results(text) to anon;

-- -----------------------------------------------------------------------------
-- Live kaart en monitor: posities, gebeurtenissen, teams en chat live doorzetten.
-- (Realtime respecteert de toegangsregels hierboven.)
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.positions, public.events, public.teams, public.messages, public.photos;
  end if;
end $$;
