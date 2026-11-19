-- =============================================================================
-- Bewaartermijn persoonsgegevens: 28 dagen (AVG)
--
-- 28 dagen na een hunt (en niet eerder dan het fotoboek voor de klant
-- verloopt) gaan de persoonsgegevens eruit:
--   telefoonnummers, GPS-routes, foto's (bestanden en rijen), chat, het
--   fotoboek met eigen foto's en PDF, de koppeling met de telefoons, en de
--   teamnamen ("De Winnaars" wordt "Team 3").
-- Wat blijft, voor de rapportage: de hunt (naam, datum, spel, versie), per
-- team de plaats in de volgorde van aanmelden, taal, track, start- en
-- eindtijd, uitkomst, de afgelegde afstand (vooraf berekend) en de
-- gebeurtenissen (antwoorden per opdracht), waaruit de beheerapp de stand
-- opnieuw berekent.
--
-- Uitvoering: de serverfunctie "opruimen" draait elke nacht (pg_cron). Die
-- verwijdert eerst de bestanden uit de opslag en roept daarna
-- anonymize_session() aan. Een hunt kan de spelleiding ook zelf meteen
-- helemaal verwijderen (knop in de beheerapp).
-- =============================================================================

alter table public.teams add column distance_m integer;
alter table public.sessions add column anonymized_at timestamptz;

-- Laatste moment waarop er in de hunt iets gebeurde.
create function public.session_last_activity(p_session uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select greatest(
    s.created_at, s.starts_at, s.started_at,
    (select max(greatest(t.created_at, t.started_at, t.ended_at)) from public.teams t where t.session_id = s.id)
  )
  from public.sessions s where s.id = p_session
$$;

-- Hunts waarvan de bewaartermijn voorbij is, met de bestanden die weg moeten.
create function public.expired_sessions(p_days integer default 28)
returns table (session_id uuid, photo_paths text[], photobook_paths text[])
language sql stable security definer set search_path = ''
as $$
  select s.id,
         coalesce((select array_agg(ph.path) from public.photos ph join public.teams t on t.id = ph.team_id
                   where t.session_id = s.id and ph.storage_provider = 'supabase'), '{}'),
         coalesce((select array_agg(o.name) from storage.objects o
                   where o.bucket_id = 'photobooks' and o.name like s.id::text || '/%'), '{}')
  from public.sessions s
  where s.anonymized_at is null
    and public.session_last_activity(s.id) < now() - make_interval(days => p_days)
    and not exists (
      select 1 from public.photobooks b
      where b.session_id = s.id and b.shared and b.shared_until is not null and b.shared_until > now()
    )
$$;

-- Persoonsgegevens van één hunt verwijderen. De bestanden in de opslag
-- verwijdert de serverfunctie "opruimen" vooraf.
create function public.anonymize_session(p_session uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.teams t
     set distance_m = coalesce(t.distance_m, public.team_distance(t.id, t.started_at, t.ended_at)),
         name = 'Team ' || t.login_order,
         team_code = 'ANON-' || replace(t.id::text, '-', '')
   where t.session_id = p_session;
  delete from public.team_contacts c using public.teams t where t.id = c.team_id and t.session_id = p_session;
  delete from public.positions p using public.teams t where t.id = p.team_id and t.session_id = p_session;
  delete from public.photos ph using public.teams t where t.id = ph.team_id and t.session_id = p_session;
  delete from public.team_members m using public.teams t where t.id = m.team_id and t.session_id = p_session;
  delete from public.messages where session_id = p_session;
  delete from public.photobooks where session_id = p_session;
  update public.sessions
     set anonymized_at = now(),
         results_shared = false,
         results_token = encode(extensions.gen_random_bytes(18), 'hex'),
         status = 'closed'
   where id = p_session;
end;
$$;

-- Alleen voor de serverfunctie (service role).
revoke execute on function public.session_last_activity(uuid), public.expired_sessions(integer), public.anonymize_session(uuid)
  from public, anon, authenticated;
grant execute on function public.expired_sessions(integer), public.anonymize_session(uuid) to service_role;

-- Afstand: na het opruimen zijn er geen posities meer, dus de vooraf berekende
-- afstand telt.
create or replace function public.build_session_results(p_session uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with t as (
    select
      tm.id, tm.name, tm.track, tm.language, tm.score, tm.outcome, tm.started_at, tm.ended_at,
      case when tm.started_at is null then null
           else extract(epoch from coalesce(tm.ended_at, now()) - tm.started_at)::integer end as duration_seconds,
      coalesce(tm.distance_m, public.team_distance(tm.id, tm.started_at, tm.ended_at)) as distance_m,
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
      select jsonb_build_object('id', s.id, 'name', s.name, 'starts_at', s.starts_at, 'timezone', s.timezone, 'status', s.status, 'test_mode', s.test_mode,
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
revoke execute on function public.build_session_results(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Hunt zelf verwijderen (spelleiding): eerst de bestanden (in de beheerapp),
-- dan de hunt met alles erin. Hiervoor mag de spelleiding foto's verwijderen.
-- -----------------------------------------------------------------------------

create policy photos_delete_staff on storage.objects for delete to authenticated using (
  bucket_id = 'photos' and public.can_run_session(public.team_session(((storage.foldername(name))[1])::uuid))
);

-- -----------------------------------------------------------------------------
-- Elke nacht opruimen (03:30). Alleen als pg_cron en pg_net beschikbaar zijn
-- (op Supabase wel; in de testdatabase niet).
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule(
      'opruimen-persoonsgegevens',
      '30 3 * * *',
      $job$ select net.http_post(
        url := 'https://wrdhjzvgdwatdqubouuk.supabase.co/functions/v1/opruimen',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      ) $job$
    );
  else
    raise notice 'pg_cron of pg_net ontbreekt: het nachtelijk opruimen is niet ingepland';
  end if;
exception when others then
  raise warning 'opruimen kon niet worden ingepland: %', sqlerrm;
end $$;
