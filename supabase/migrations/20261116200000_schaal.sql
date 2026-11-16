-- =============================================================================
-- Voorbereid op groei (doel: 10.000 tot 100.000 evenementen per jaar, pieken van
-- ~1.000 sessies en ~10.000 telefoons tegelijk). Zie docs/ontwerp.md §11.1.
--
-- - GPS komt gebundeld binnen: één verzoek per ~20 seconden per telefoon.
-- - Foto's onthouden bij welke opslag ze staan, zodat een overstap naar
--   Cloudflare R2 kan zonder oude foto's te verplaatsen.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GPS-bundels
-- -----------------------------------------------------------------------------

-- Slaat een bundel posities in één keer op. p_fixes is een JSON-lijst van
-- {lat, lng, accuracy, at} met at in ms sinds epoch (PositionUploader in de app).
create function public.record_positions(p_team uuid, p_fixes jsonb)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fixes) <> 'array' or jsonb_array_length(p_fixes) > 200 then
    raise exception 'bundel moet een lijst van maximaal 200 posities zijn' using errcode = '22023';
  end if;
  insert into public.positions (team_id, lat, lng, accuracy, recorded_at)
  select p_team, (f ->> 'lat')::double precision, (f ->> 'lng')::double precision, (f ->> 'accuracy')::real,
         to_timestamp((f ->> 'at')::double precision / 1000)
  from jsonb_array_elements(p_fixes) f
  where (f ->> 'lat') is not null and (f ->> 'lng') is not null and (f ->> 'accuracy') is not null and (f ->> 'at') is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Foto-opslag los van de aanbieder
-- -----------------------------------------------------------------------------

alter table public.photos
  add column storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'r2'));

comment on column public.photos.path is 'Sleutel van het bestand binnen de opslag van storage_provider: <team_id>/<opdracht>/<bestand>';

create or replace function public.build_session_results(p_session uuid)
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
        select jsonb_agg(jsonb_build_object('task', ph.task_key, 'provider', ph.storage_provider, 'path', ph.path, 'taken_at', ph.created_at) order by ph.created_at)
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


revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.build_session_results(uuid), public.team_distance(uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.shared_session_results(text) to anon;
