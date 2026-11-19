-- =============================================================================
-- Spelleider: alleen kijken (live monitor en resultaten)
--
-- Een spelleider (rol instructor) heeft in de beheeromgeving alleen de pagina
-- "Live & resultaten" van een hunt nodig. Hij ziet de hunts van zijn
-- organisatie met kaart, ranglijst, antwoorden en foto's, maar maakt of wijzigt
-- niets: geen hunts aanmaken, openen, sluiten of verwijderen, geen teams
-- aanpassen, geen chat, geen fotoboek, geen collega's uitnodigen. Een hunt
-- maakt een beheerder of partner aan.
--
-- - can_run_session (beheren) en can_watch_session (spellen-eigenaar beheert
--   mee) gelden niet meer voor spelleiders.
-- - Nieuw: can_view_session, voor alles wat de resultatenpagina leest.
-- =============================================================================

create or replace function public.can_run_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_member(public.session_org(p_session), array['owner', 'admin', 'editor']::public.member_role[]) $$;

create or replace function public.can_watch_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_run_session(p_session)
      or public.is_member(public.session_game_owner(p_session), array['owner', 'admin', 'editor']::public.member_role[]);
$$;

-- Mag de gebruiker de live monitor en resultaten van deze hunt zien? Elk lid
-- (ook een spelleider) van de organisatie van de hunt of van het spel.
create function public.can_view_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_member(public.session_org(p_session))
      or public.is_member(public.session_game_owner(p_session));
$$;
revoke execute on function public.can_view_session(uuid) from public, anon;
grant execute on function public.can_view_session(uuid) to authenticated;

-- Hunts aanmaken, wijzigen en verwijderen: niet meer door spelleiders.
drop policy sessions_write on public.sessions;
create policy sessions_write on public.sessions for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]))
  with check (
    public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[])
    and public.can_view_game(public.version_game(game_version_id))
  );

-- Lezen voor de resultatenpagina.
drop policy sessions_select_staff on public.sessions;
create policy sessions_select_staff on public.sessions for select to authenticated
  using (public.is_member(org_id) or public.can_view_session(id));

drop policy teams_select_staff on public.teams;
create policy teams_select_staff on public.teams for select to authenticated
  using (public.can_view_session(session_id));

drop policy events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (public.is_team_member(team_id) or public.can_view_session(public.team_session(team_id)));

drop policy positions_select on public.positions;
create policy positions_select on public.positions for select to authenticated
  using (public.is_team_member(team_id) or public.can_view_session(public.team_session(team_id)));

drop policy photos_select on public.photos;
create policy photos_select on public.photos for select to authenticated
  using (public.plays_in_session(public.team_session(team_id)) or public.can_view_session(public.team_session(team_id)));

drop policy photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    public.plays_in_session(public.team_session(((storage.foldername(name))[1])::uuid))
    or public.can_view_session(public.team_session(((storage.foldername(name))[1])::uuid))
  )
);

drop policy team_contacts_select on public.team_contacts;
create policy team_contacts_select on public.team_contacts for select to authenticated
  using (public.is_team_member(team_id) or public.can_view_session(public.team_session(team_id)));

create or replace function public.session_results(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.can_view_session(p_session) or public.plays_in_session(p_session)) then
    raise exception 'geen toegang tot deze sessie' using errcode = '42501';
  end if;
  return public.build_session_results(p_session);
end;
$$;

-- Collega's uitnodigen bij een partner: alleen partners (editor), niet spelleiders.
create or replace function public.invite_member(p_org uuid, p_email text, p_role public.member_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_platform boolean;
  v_user uuid;
begin
  select is_platform into v_platform from public.organizations where id = p_org;
  if not found then
    raise exception 'onbekende organisatie' using errcode = 'P0002';
  end if;

  if v_platform then
    if not public.is_member(p_org, array['owner', 'admin']::public.member_role[]) then
      raise exception 'alleen eigenaren en beheerders kunnen uitnodigen' using errcode = '42501';
    end if;
    if p_role = 'owner' and not public.is_member(p_org, array['owner']::public.member_role[]) then
      raise exception 'alleen een eigenaar kan een eigenaar uitnodigen' using errcode = '42501';
    end if;
    if p_role = 'editor' then
      raise exception 'eigen collega''s worden beheerder of spelleider' using errcode = '22023';
    end if;
  else
    if p_role in ('owner', 'admin') then
      raise exception 'een partner kan geen eigenaar of beheerder hebben' using errcode = '42501';
    end if;
    -- Een partner nodigt alleen een partner uit; het platform met elke partnerrol.
    if not public.is_platform_admin()
       and (public.my_role(p_org) is distinct from 'editor' or p_role <> 'editor') then
      raise exception 'je kunt alleen een collega uitnodigen met dezelfde rechten als jij' using errcode = '42501';
    end if;
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'ongeldig e-mailadres' using errcode = '22023';
  end if;
  insert into public.invitations (email, org_id, role, invited_by)
  values (v_email, p_org, p_role, auth.uid())
  on conflict (email, org_id) do update set role = excluded.role, invited_by = excluded.invited_by,
    created_at = now(), accepted_at = null;
  select id into v_user from auth.users
  where lower(email) = v_email and not coalesce(is_anonymous, false) and email_confirmed_at is not null;
  if v_user is not null then
    perform public.accept_invitations(v_user, v_email);
  end if;
end;
$$;

-- "Gepakt" bijhouden in de ranglijst blijft wel werk van de spelleider.
create or replace function public.bump_team_caught(p_team uuid, p_delta integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_caught integer;
begin
  if p_delta not in (-1, 1) then
    raise exception 'delta moet 1 of -1 zijn';
  end if;
  if not public.is_member(public.session_org(public.team_session(p_team))) then
    raise exception 'geen toegang tot dit team' using errcode = '42501';
  end if;
  update public.teams set caught = greatest(0, caught + p_delta)
   where id = p_team
   returning caught into v_caught;
  return v_caught;
end;
$$;

-- =============================================================================
-- Spelleider-link: live monitor en resultaten zonder account
--
-- Een spelleider heeft geen account nodig. Per hunt maakt een beheerder of
-- partner een geheime link; wie die opent ziet de kaart, de ranglijst en de
-- antwoorden en kan "gepakt" bijhouden. Geen telefoonnummers, geen foto's,
-- niets wijzigen. Een nieuwe link maken zet de oude uit. Na het opruimen
-- (28 dagen) werkt de link niet meer.
-- =============================================================================

alter table public.sessions add column leader_token text unique;

-- Link ophalen (en de eerste keer aanmaken), of met p_new een nieuwe maken.
create function public.leader_link(p_session uuid, p_new boolean default false)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.can_run_session(p_session) then
    raise exception 'geen toegang tot deze hunt' using errcode = '42501';
  end if;
  select leader_token into v_token from public.sessions where id = p_session;
  if v_token is null or p_new then
    v_token := encode(extensions.gen_random_bytes(18), 'hex');
    update public.sessions set leader_token = v_token where id = p_session;
  end if;
  return v_token;
end;
$$;

create function public.leader_session_id(p_token text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from public.sessions
  where leader_token = p_token and length(coalesce(p_token, '')) >= 32 and anonymized_at is null
$$;

-- Alles voor de live monitor in één keer. p_after_position: alleen posities
-- met een hoger id (de pagina haalt zo elke paar seconden alleen het nieuwe op).
create function public.leader_session(p_token text, p_after_position bigint default 0)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session uuid := public.leader_session_id(p_token);
begin
  if v_session is null then
    raise exception 'onbekende of verlopen link' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'session', (
      select jsonb_build_object('id', s.id, 'name', s.name, 'status', s.status, 'test_mode', s.test_mode,
        'starts_at', s.starts_at, 'timezone', s.timezone, 'join_code', s.join_code, 'team_chat', s.team_chat)
      from public.sessions s where s.id = v_session
    ),
    'game', (
      select v.package from public.sessions s join public.game_versions v on v.id = s.game_version_id where s.id = v_session
    ),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'track', t.track, 'language', t.language,
        'score', t.score, 'outcome', t.outcome, 'started_at', t.started_at, 'ended_at', t.ended_at,
        'login_order', t.login_order, 'team_code', '', 'caught', t.caught, 'ready_at', t.ready_at,
        'stored_distance_m', t.distance_m) order by t.login_order)
      from public.teams t where t.session_id = v_session
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'team_id', e.team_id, 'type', e.type, 'task_key', e.task_key,
        'payload', e.payload, 'client_time', e.client_time) order by e.client_time, e.id)
      from public.events e join public.teams t on t.id = e.team_id where t.session_id = v_session
    ), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'team_id', p.team_id, 'lat', p.lat, 'lng', p.lng,
        'accuracy', p.accuracy, 'recorded_at', p.recorded_at) order by p.id)
      from public.positions p join public.teams t on t.id = p.team_id
      where t.session_id = v_session and p.id > coalesce(p_after_position, 0)
    ), '[]'::jsonb)
  );
end;
$$;

-- "Gepakt" bijhouden via de link.
create function public.leader_bump_caught(p_token text, p_team uuid, p_delta integer)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caught integer;
begin
  if p_delta not in (-1, 1) then
    raise exception 'delta moet 1 of -1 zijn';
  end if;
  update public.teams set caught = greatest(0, caught + p_delta)
   where id = p_team and session_id = public.leader_session_id(p_token)
   returning caught into v_caught;
  if not found then
    raise exception 'onbekende of verlopen link' using errcode = 'P0002';
  end if;
  return v_caught;
end;
$$;

revoke execute on function public.leader_link(uuid, boolean), public.leader_session_id(text),
  public.leader_session(text, bigint), public.leader_bump_caught(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.leader_link(uuid, boolean) to authenticated;
grant execute on function public.leader_session(text, bigint), public.leader_bump_caught(text, uuid, integer) to anon, authenticated;

-- Opruimen na 28 dagen: de link vervalt ook.
create or replace function public.clear_leader_token_on_anonymize()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.anonymized_at is not null then
    new.leader_token := null;
  end if;
  return new;
end;
$$;
create trigger clear_leader_token before update of anonymized_at on public.sessions
  for each row execute function public.clear_leader_token_on_anonymize();
revoke execute on function public.clear_leader_token_on_anonymize() from public, anon, authenticated;
