-- =============================================================================
-- Nieuwsflitsen en het eindscherm
--
-- Nieuwsflitsen: korte berichtjes onderin het scherm van de teams over wat er
-- in de hunt gebeurt, zonder te verraden wáár andere teams zijn.
--
-- - Automatisch: een ander team heeft het extractiepunt bereikt ('escaped')
--   of een puzzel opgelost ('puzzle'). De app van dat team meldt het zelf
--   (team_report_news), één keer per team en puzzel. "Nog 10 minuten" rekent
--   de app zelf uit.
-- - Van de spelleider ('leader'): een snelknop met een vast bericht in alle
--   talen, of zelf getypt (leader_send_news). De snelknoppen staan in
--   org_settings.settings -> 'news' -> 'presets' (Instellingen › Nieuwsflitsen);
--   zonder eigen lijst gebruikt de app de startset.
-- - Welke automatische flitsen aan staan: org_settings.settings -> 'news' ->
--   'auto' ({ escaped, puzzle, timeLeft }; ontbreekt = aan).
-- - team_signals (elke 10 seconden) geeft ook de nieuwe flitsen mee.
--
-- Eindscherm: de app meldt aan het einde de score, het einde en de eindtijd
-- (team_finish, in de kolommen die daar al voor waren). team_summary geeft de
-- afgelegde afstand, de stand van de teams die klaar zijn en wie de eerste of
-- de meeste was (voor de badges).
-- =============================================================================

create table public.news_flashes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  -- Het team waar het automatische nieuws over gaat; leeg bij de spelleider.
  team_id uuid references public.teams (id) on delete cascade,
  kind text not null check (kind in ('leader', 'escaped', 'puzzle')),
  -- De puzzel (opdrachtsleutel) bij 'puzzle'.
  task_key text,
  -- Van de spelleider: emoji, titel en tekst per taal.
  icon text,
  title jsonb not null default '{}'::jsonb check (jsonb_typeof(title) = 'object'),
  body jsonb not null default '{}'::jsonb check (jsonb_typeof(body) = 'object'),
  sender_name text,
  -- clock_timestamp: ook twee flitsen in één transactie hebben een eigen tijd.
  created_at timestamptz not null default clock_timestamp()
);
create index news_flashes_session_idx on public.news_flashes (session_id, created_at);
-- Elk automatisch nieuwtje maar één keer, ook als twee telefoons van een team het melden.
create unique index news_flashes_once on public.news_flashes (team_id, kind, coalesce(task_key, '')) where kind <> 'leader';

alter table public.news_flashes enable row level security;
-- De spelleiding in het beheer mag meekijken; teams en spelleiders lezen via de functies hieronder.
create policy news_flashes_select on public.news_flashes for select to authenticated
  using (public.can_view_session(session_id));
revoke all on public.news_flashes from anon, authenticated;
grant select on public.news_flashes to authenticated;

-- Welke automatische flitsen aan staan, voor de organisatie van een hunt.
create function public.session_news_auto(p_session uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'escaped', coalesce((select (o.settings #>> '{news,auto,escaped}')::boolean from public.org_settings o
                          join public.sessions s on s.org_id = o.org_id where s.id = p_session
                          and jsonb_typeof(o.settings #> '{news,auto,escaped}') = 'boolean'), true),
    'puzzle', coalesce((select (o.settings #>> '{news,auto,puzzle}')::boolean from public.org_settings o
                          join public.sessions s on s.org_id = o.org_id where s.id = p_session
                          and jsonb_typeof(o.settings #> '{news,auto,puzzle}') = 'boolean'), true),
    'timeLeft', coalesce((select (o.settings #>> '{news,auto,timeLeft}')::boolean from public.org_settings o
                          join public.sessions s on s.org_id = o.org_id where s.id = p_session
                          and jsonb_typeof(o.settings #> '{news,auto,timeLeft}') = 'boolean'), true)
  );
$$;
revoke execute on function public.session_news_auto(uuid) from public, anon, authenticated;

-- Een flits als JSON voor de app.
create function public.news_json(f public.news_flashes)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'kind', f.kind,
    'team_id', f.team_id,
    'team_name', (select name from public.teams where id = f.team_id),
    'task', f.task_key,
    'icon', f.icon,
    'title', f.title,
    'body', f.body,
    'sender_name', f.sender_name,
    'at', floor(extract(epoch from f.created_at) * 1000)::bigint,
    -- Het hoeveelste team met dit nieuws (1 = als eerste).
    'n', case when f.kind = 'leader' then null else (
      select count(*) from public.news_flashes g
       where g.session_id = f.session_id and g.kind = f.kind
         and coalesce(g.task_key, '') = coalesce(f.task_key, '')
         and (g.created_at, g.id) <= (f.created_at, f.id)
    ) end
  );
$$;
revoke execute on function public.news_json(public.news_flashes) from public, anon, authenticated;

-- De app van een team meldt zelf: extractiepunt bereikt, of een puzzel opgelost.
create function public.team_report_news(p_team uuid, p_kind text, p_task text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  if p_kind not in ('escaped', 'puzzle') then
    raise exception 'onbekend soort nieuws' using errcode = '22023';
  end if;
  if p_kind = 'puzzle' and (p_task is null or length(p_task) not between 1 and 100) then
    raise exception 'puzzel ontbreekt' using errcode = '22023';
  end if;
  insert into public.news_flashes (session_id, team_id, kind, task_key)
  select t.session_id, t.id, p_kind, case when p_kind = 'puzzle' then p_task end
    from public.teams t
   where t.id = p_team and t.started_at is not null
  on conflict do nothing;
end;
$$;
revoke execute on function public.team_report_news(uuid, text, text) from public, anon;
grant execute on function public.team_report_news(uuid, text, text) to authenticated;

-- Aan het einde: score, einde en eindtijd van het team (de eindtijd verandert daarna niet meer).
create function public.team_finish(p_team uuid, p_score integer, p_ending text, p_ended_at double precision)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  update public.teams
     set score = coalesce(p_score, score),
         outcome = coalesce(left(p_ending, 60), outcome),
         ended_at = coalesce(ended_at, least(now(), greatest(started_at, to_timestamp(p_ended_at / 1000.0))))
   where id = p_team and started_at is not null;
end;
$$;
revoke execute on function public.team_finish(uuid, integer, text, double precision) from public, anon;
grant execute on function public.team_finish(uuid, integer, text, double precision) to authenticated;

-- Voor het eindscherm: afstand, de stand van de teams die klaar zijn, en wie
-- de eerste of de meeste was.
create function public.team_summary(p_team uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session uuid;
  v_out jsonb;
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  select session_id into v_session from public.teams where id = p_team;
  with started as (
    select t.id, t.score, t.ended_at,
           coalesce(t.distance_m, public.team_distance(t.id, t.started_at, coalesce(t.ended_at, now()))) as distance
      from public.teams t
     where t.session_id = v_session and t.started_at is not null
  )
  select jsonb_build_object(
    'distance_m', (select distance from started where id = p_team),
    'teams', (select count(*) from started),
    'finished', coalesce((select jsonb_agg(jsonb_build_object('team', id, 'score', score)) from started where ended_at is not null), '[]'::jsonb),
    'first_escape_team', (select team_id from public.news_flashes where session_id = v_session and kind = 'escaped' order by created_at, id limit 1),
    'first_puzzle_team', (select team_id from public.news_flashes where session_id = v_session and kind = 'puzzle' order by created_at, id limit 1),
    'most_distance_team', (select id from started where distance > 0 order by distance desc, id limit 1),
    'most_photos_team', (
      select p.team_id from public.photos p join started s on s.id = p.team_id
       where left(p.task_key, 1) <> '_'
       group by p.team_id order by count(*) desc, p.team_id limit 1
    )
  ) into v_out;
  return v_out;
end;
$$;
revoke execute on function public.team_summary(uuid) from public, anon;
grant execute on function public.team_summary(uuid) to authenticated;

-- Wat een spelend team elke 10 seconden vraagt, nu met de nieuwsflitsen.
-- p_news_since: servertijd in ms; zonder (oudere app) geen flitsen.
drop function public.team_signals(uuid, double precision);
create function public.team_signals(p_team uuid, p_since double precision default 0, p_news_since double precision default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session uuid;
  v_auto jsonb;
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  select session_id into v_session from public.teams where id = p_team;
  v_auto := public.session_news_auto(v_session);
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
    ), '[]'::jsonb),
    'news', coalesce((
      select jsonb_agg(n.item order by n.at)
      from (
        select public.news_json(f) as item, f.created_at as at
          from public.news_flashes f
         where p_news_since is not null
           and f.session_id = v_session
           and floor(extract(epoch from f.created_at) * 1000) > p_news_since
           -- Eigen nieuws niet: dat weet het team zelf al.
           and (f.team_id is null or f.team_id <> p_team)
           and (f.kind = 'leader' or coalesce((v_auto ->> f.kind)::boolean, true))
         order by f.created_at desc
         limit 20
      ) n
    ), '[]'::jsonb),
    'news_auto', v_auto
  );
end;
$$;
revoke execute on function public.team_signals(uuid, double precision, double precision) from public, anon;
grant execute on function public.team_signals(uuid, double precision, double precision) to authenticated;

-- Spelleider stuurt een nieuwsflits naar alle teams van de hunt.
create function public.leader_send_news(p_session uuid, p_icon text, p_title jsonb, p_body jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_row public.news_flashes;
  v_name text;
begin
  perform public.require_session_leader(p_session);
  if jsonb_typeof(p_title) <> 'object' or jsonb_typeof(coalesce(p_body, '{}'::jsonb)) <> 'object' then
    raise exception 'titel en tekst per taal' using errcode = '22023';
  end if;
  if not exists (select 1 from jsonb_each_text(p_title) where length(trim(value)) > 0) then
    raise exception 'titel ontbreekt' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_title) where jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 120 or length(key) > 10)
     or exists (select 1 from jsonb_each(coalesce(p_body, '{}'::jsonb)) where jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 300 or length(key) > 10)
     or length(coalesce(p_icon, '')) > 16 then
    raise exception 'nieuwsflits te lang' using errcode = '22023';
  end if;
  select name into v_name from public.session_leaders where session_id = p_session and user_id = auth.uid();
  insert into public.news_flashes (session_id, kind, icon, title, body, sender_name)
  values (p_session, 'leader', nullif(trim(coalesce(p_icon, '')), ''), p_title, coalesce(p_body, '{}'::jsonb), v_name)
  returning * into v_row;
  return public.news_json(v_row);
end;
$$;

-- Snelknoppen en de laatst verstuurde flitsen, voor de spelleider-app.
create function public.leader_news(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_session_leader(p_session);
  return jsonb_build_object(
    'presets', (
      select o.settings #> '{news,presets}' from public.org_settings o
        join public.sessions s on s.org_id = o.org_id
       where s.id = p_session and jsonb_typeof(o.settings #> '{news,presets}') = 'array'
    ),
    'sent', coalesce((
      select jsonb_agg(n.item order by n.at desc)
      from (
        select public.news_json(f) as item, f.created_at as at
          from public.news_flashes f
         where f.session_id = p_session and f.kind = 'leader'
         order by f.created_at desc
         limit 30
      ) n
    ), '[]'::jsonb)
  );
end;
$$;

-- Mag de ingelogde gebruiker als spelleider van deze hunt een flits laten vertalen?
create function public.leader_can_translate(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_session_leader(p_session) $$;

revoke execute on function public.leader_send_news(uuid, text, jsonb, jsonb), public.leader_news(uuid), public.leader_can_translate(uuid)
  from public, anon;
grant execute on function public.leader_send_news(uuid, text, jsonb, jsonb), public.leader_news(uuid), public.leader_can_translate(uuid)
  to authenticated;

-- Opruimen na de bewaartermijn: zelf getypte flitsen van de spelleider weg
-- (die kunnen namen bevatten). Verder gelijk aan de vorige versie.
create or replace function public.anonymize_session(p_session uuid)
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
  delete from public.news_flashes where session_id = p_session and kind = 'leader';
  delete from public.photobooks where session_id = p_session;
  update public.sessions
     set anonymized_at = now(),
         results_shared = false,
         results_token = encode(extensions.gen_random_bytes(18), 'hex'),
         status = 'closed'
   where id = p_session;
end;
$$;
revoke execute on function public.anonymize_session(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_session(uuid) to service_role;
