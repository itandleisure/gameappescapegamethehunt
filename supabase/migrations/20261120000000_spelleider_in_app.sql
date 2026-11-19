-- =============================================================================
-- Spelleiders in de game-app
--
-- In plaats van de spelleider-link logt een spelleider in de game-app in met
-- de spelleider-code van een hunt en een eigen naam. Hij ziet dan geen spel
-- maar de kaart met alle teams en de andere spelleiders, de ranglijst met
-- telefoonnummers en "gepakt", en de teamchat als "The Hunters". De app stuurt
-- zijn positie, ook op de achtergrond. Teams zien de spelleiders niet.
--
-- - sessions.leader_code: één code per hunt voor alle spelleiders.
-- - sessions.max_leaders: zoveel spelleiders mogen er tegelijk inloggen.
-- - session_leaders: de spelleiders die zijn ingelogd, met hun laatste positie.
--
-- De spelleider-link (leader_token en de leader_*-functies) vervalt.
-- =============================================================================

-- Spelleider-link weg.
drop trigger if exists clear_leader_token on public.sessions;
drop function if exists public.clear_leader_token_on_anonymize();
drop function if exists public.leader_link(uuid, boolean);
drop function if exists public.leader_session(text, bigint);
drop function if exists public.leader_bump_caught(text, uuid, integer);
drop function if exists public.leader_messages(text);
drop function if exists public.leader_send_message(text, text);
drop function if exists public.leader_session_id(text);
alter table public.sessions drop column if exists leader_token;

alter table public.sessions
  add column leader_code text unique,
  add column max_leaders integer not null default 5 check (max_leaders between 0 and 50);

create table public.session_leaders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  lat double precision,
  lng double precision,
  accuracy real,
  located_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);
create unique index session_leaders_name on public.session_leaders (session_id, lower(name));

-- De spelleiding in het beheer ziet de spelleiders op de kaart en kan er een
-- afmelden. Teams zien ze niet. Spelleiders zelf lezen via de functies hieronder.
alter table public.session_leaders enable row level security;
create policy session_leaders_select on public.session_leaders for select to authenticated
  using (public.can_view_session(session_id));
create policy session_leaders_delete on public.session_leaders for delete to authenticated
  using (public.can_run_session(session_id));
revoke all on public.session_leaders from anon, authenticated;
grant select, delete on public.session_leaders to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.session_leaders;
  end if;
end $$;

-- Spelleider-code van een hunt ophalen of vernieuwen. Een nieuwe code meldt
-- alle spelleiders af: zij moeten opnieuw inloggen met de nieuwe code.
create function public.leader_code(p_session uuid, p_new boolean default false)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.can_run_session(p_session) then
    raise exception 'geen toegang tot deze hunt' using errcode = '42501';
  end if;
  select leader_code into v_code from public.sessions where id = p_session and anonymized_at is null;
  if not found then
    raise exception 'hunt niet gevonden' using errcode = 'P0002';
  end if;
  if v_code is null or p_new then
    loop
      v_code := public.random_code(6);
      exit when not exists (select 1 from public.sessions where leader_code = v_code);
    end loop;
    update public.sessions set leader_code = v_code where id = p_session;
    if p_new then
      delete from public.session_leaders where session_id = p_session;
    end if;
  end if;
  return v_code;
end;
$$;

-- Inloggen als spelleider met de code en een naam. Dezelfde naam opnieuw
-- (bijvoorbeeld op een andere telefoon) neemt die spelleider over.
create function public.leader_join(p_code text, p_name text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_session public.sessions;
  v_name text := trim(coalesce(p_name, ''));
  v_row public.session_leaders;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '42501';
  end if;
  select * into v_session from public.sessions
   where leader_code = upper(trim(coalesce(p_code, ''))) and anonymized_at is null;
  if not found then
    raise exception 'onbekende spelleider-code' using errcode = 'P0002';
  end if;
  if length(v_name) not between 1 and 40 then
    raise exception 'naam moet 1 tot 40 tekens zijn' using errcode = '22023';
  end if;

  -- Deze telefoon was al ingelogd: alleen de naam bijwerken.
  select * into v_row from public.session_leaders where session_id = v_session.id and user_id = auth.uid();
  if found then
    if exists (select 1 from public.session_leaders
                where session_id = v_session.id and lower(name) = lower(v_name) and id <> v_row.id) then
      raise exception 'deze naam is al in gebruik' using errcode = '23505';
    end if;
    update public.session_leaders set name = v_name where id = v_row.id returning * into v_row;
  else
    -- Zelfde naam: deze spelleider gaat verder op een andere telefoon.
    update public.session_leaders set user_id = auth.uid()
     where session_id = v_session.id and lower(name) = lower(v_name)
     returning * into v_row;
    if not found then
      if (select count(*) from public.session_leaders where session_id = v_session.id) >= v_session.max_leaders then
        raise exception 'maximum aantal spelleiders bereikt' using errcode = 'P0006';
      end if;
      insert into public.session_leaders (session_id, user_id, name)
      values (v_session.id, auth.uid(), v_name)
      returning * into v_row;
    end if;
  end if;
  return jsonb_build_object('session_id', v_session.id, 'leader_id', v_row.id, 'name', v_row.name,
    'session_name', v_session.name);
end;
$$;

-- Is de ingelogde gebruiker spelleider van deze hunt?
create function public.is_session_leader(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.session_leaders l join public.sessions s on s.id = l.session_id
     where l.session_id = p_session and l.user_id = auth.uid() and s.anonymized_at is null
  );
$$;

create function public.require_session_leader(p_session uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_session_leader(p_session) then
    raise exception 'geen spelleider van deze hunt' using errcode = 'P0002';
  end if;
end;
$$;

-- Alles wat de spelleider-app nodig heeft: hunt, spel, teams met
-- telefoonnummer, gebeurtenissen, nieuwe posities en de spelleiders.
create function public.leader_session(p_session uuid, p_after_position bigint default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_session_leader(p_session);
  return jsonb_build_object(
    'session', (
      select jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status, 'test_mode', s.test_mode,
        'starts_at', s.starts_at, 'timezone', s.timezone, 'join_code', s.join_code, 'team_chat', s.team_chat)
      from public.sessions s where s.id = p_session
    ),
    'game', (
      select v.package from public.sessions s join public.game_versions v on v.id = s.game_version_id where s.id = p_session
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'track', t.track, 'language', t.language,
        'score', t.score, 'outcome', t.outcome, 'started_at', t.started_at, 'ended_at', t.ended_at,
        'login_order', t.login_order, 'caught', t.caught, 'ready_at', t.ready_at, 'phone', c.phone)
        order by t.login_order)
      from public.teams t left join public.team_contacts c on c.team_id = t.id
      where t.session_id = p_session
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'team_id', e.team_id, 'type', e.type, 'task_key', e.task_key,
        'payload', e.payload, 'client_time', e.client_time) order by e.client_time, e.id)
      from public.events e join public.teams t on t.id = e.team_id where t.session_id = p_session
    ), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'team_id', p.team_id, 'lat', p.lat, 'lng', p.lng,
        'accuracy', p.accuracy, 'recorded_at', p.recorded_at) order by p.id)
      from public.positions p join public.teams t on t.id = p.team_id
      where t.session_id = p_session and p.id > coalesce(p_after_position, 0)
    ), '[]'::jsonb),
    'leaders', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'lat', l.lat, 'lng', l.lng,
        'accuracy', l.accuracy, 'located_at', l.located_at, 'me', l.user_id = auth.uid()) order by l.created_at)
      from public.session_leaders l where l.session_id = p_session
    ), '[]'::jsonb)
  );
end;
$$;

-- Positie van de spelleider, ook vanaf de achtergrond.
create function public.leader_position(p_session uuid, p_lat double precision, p_lng double precision, p_accuracy real)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'ongeldige positie' using errcode = '22023';
  end if;
  update public.session_leaders
     set lat = p_lat, lng = p_lng, accuracy = p_accuracy, located_at = now()
   where session_id = p_session and user_id = auth.uid();
  if not found then
    raise exception 'geen spelleider van deze hunt' using errcode = 'P0002';
  end if;
end;
$$;

-- "Gepakt" bijhouden.
create function public.leader_bump_caught(p_session uuid, p_team uuid, p_delta integer)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caught integer;
begin
  perform public.require_session_leader(p_session);
  if p_delta not in (-1, 1) then
    raise exception 'delta moet 1 of -1 zijn' using errcode = '22023';
  end if;
  update public.teams set caught = greatest(0, caught + p_delta)
   where id = p_team and session_id = p_session
   returning caught into v_caught;
  if not found then
    raise exception 'team niet gevonden' using errcode = 'P0002';
  end if;
  return v_caught;
end;
$$;

-- Teamchat lezen (hooguit de laatste 200 berichten).
create function public.leader_messages(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_session_leader(p_session);
  return coalesce((
    select jsonb_agg(m order by m.created_at)
    from (
      select id, team_id, sender, sender_name, body, created_at
      from public.messages
      where session_id = p_session and channel = 'teams'
      order by created_at desc
      limit 200
    ) m
  ), '[]'::jsonb);
end;
$$;

-- Bericht aan alle teams als "The Hunters".
create function public.leader_send_message(p_session uuid, p_body text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_row public.messages;
begin
  perform public.require_session_leader(p_session);
  if length(trim(coalesce(p_body, ''))) not between 1 and 500 then
    raise exception 'bericht moet 1 tot 500 tekens zijn' using errcode = '22023';
  end if;
  insert into public.messages (session_id, sender, channel, body)
  values (p_session, 'staff', 'teams', trim(p_body))
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'team_id', v_row.team_id, 'sender', v_row.sender,
    'sender_name', v_row.sender_name, 'body', v_row.body, 'created_at', v_row.created_at);
end;
$$;

-- Afmelden als spelleider.
create function public.leader_leave(p_session uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.session_leaders where session_id = p_session and user_id = auth.uid();
$$;

revoke execute on function public.leader_code(uuid, boolean), public.leader_join(text, text),
  public.is_session_leader(uuid), public.require_session_leader(uuid), public.leader_session(uuid, bigint),
  public.leader_position(uuid, double precision, double precision, real), public.leader_bump_caught(uuid, uuid, integer),
  public.leader_messages(uuid), public.leader_send_message(uuid, text), public.leader_leave(uuid)
  from public, anon, authenticated;
grant execute on function public.leader_code(uuid, boolean), public.leader_join(text, text),
  public.leader_session(uuid, bigint), public.leader_position(uuid, double precision, double precision, real),
  public.leader_bump_caught(uuid, uuid, integer), public.leader_messages(uuid), public.leader_send_message(uuid, text),
  public.leader_leave(uuid)
  to authenticated;

-- Opruimen na 28 dagen: code weg en spelleiders afgemeld.
create function public.clear_leaders_on_anonymize()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.anonymized_at is not null and old.anonymized_at is null then
    new.leader_code := null;
    delete from public.session_leaders where session_id = new.id;
  end if;
  return new;
end;
$$;
create trigger clear_leaders before update of anonymized_at on public.sessions
  for each row execute function public.clear_leaders_on_anonymize();
revoke execute on function public.clear_leaders_on_anonymize() from public, anon, authenticated;
