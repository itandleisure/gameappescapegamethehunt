-- =============================================================================
-- Fundament van de Hunt-app (fase 1)
--
-- Datamodel uit docs/ontwerp.md §6, met toegangsregels in de database zelf
-- (row level security): een team ziet alleen zijn eigen sessie, een beheerder
-- alleen de eigen organisatie.
--
-- Spelers loggen in via Supabase "anonymous sign-in" en worden met
-- join_session() aan een team gekoppeld. Beheerders loggen in met e-mail.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'admin', 'editor', 'instructor');
create type public.game_layer as enum ('base', 'city', 'client');
create type public.session_status as enum ('draft', 'open', 'closed');
create type public.message_sender as enum ('staff', 'team');

-- -----------------------------------------------------------------------------
-- Organisaties en beheerders
-- -----------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_path text,
  colors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Rol van een beheerder binnen een organisatie (ontwerp: tabel "users").
create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- -----------------------------------------------------------------------------
-- Games en lagen: basisspel → stadsvariant → klantvariant
-- -----------------------------------------------------------------------------

create table public.games (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  parent_id uuid references public.games (id) on delete restrict,
  layer public.game_layer not null,
  slug text not null,
  languages text[] not null default array['nl'],
  default_language text not null default 'nl',
  -- Instellingen op spelniveau: reeksen, eindes, GPS, verzamelpunt, overlay.
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  constraint games_layer_parent check ((layer = 'base') = (parent_id is null))
);
create index games_parent_idx on public.games (parent_id);

-- Opdrachten bestaan alleen in het basisspel.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  key text not null,
  position integer not null default 0,
  answer jsonb not null default '{"type":"info"}'::jsonb,
  points integer not null default 0,
  wrong_points integer not null default 0,
  tags text[] not null default '{}',
  -- Prijzen van de hints; de teksten staan in translations.
  hint_costs integer[] not null default '{}',
  has_confirm boolean not null default false,
  retry_until_correct boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  unique (game_id, key)
);

-- Locatie van een opdracht, per laag (basis of stad) en optioneel per track.
create table public.task_locations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  track integer check (track is null or track >= 1),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius integer not null check (radius > 0)
);
create unique index task_locations_unique on public.task_locations (game_id, task_id, coalesce(track, 0));

-- Welke velden een stad of klant mag invullen ("aanpasbare velden").
create table public.overridable_fields (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  field text not null,
  layers public.game_layer[] not null,
  label text
);

-- Wat een stad of klant aanpast (niet-tekstvelden; teksten staan in translations).
create table public.overrides (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  field text not null,
  value jsonb not null
);
create unique index overrides_unique on public.overrides (game_id, coalesce(task_id, '00000000-0000-0000-0000-000000000000'::uuid), field);

-- Alle teksten, per laag en per taal.
create table public.translations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  entity text not null,      -- 'game', 'task', 'rule', 'ending', 'playground', ...
  entity_id text not null,   -- sleutel binnen het spel, bijvoorbeeld de opdrachtsleutel
  field text not null,       -- 'title', 'body', 'hint.0', 'option.2', ...
  lang text not null,
  text text not null,
  updated_at timestamptz not null default now(),
  unique (game_id, entity, entity_id, field, lang)
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  key text not null,
  position integer not null default 0,
  label text,
  condition jsonb not null,
  actions jsonb not null,
  unique (game_id, key)
);

create table public.playgrounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  key text not null,
  background_path text,
  buttons jsonb not null default '[]'::jsonb,
  unique (game_id, key)
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  game_id uuid references public.games (id) on delete set null,
  path text not null,
  kind text not null check (kind in ('image', 'audio', 'video', 'overlay')),
  lang text,
  created_at timestamptz not null default now()
);

-- Vaste, samengestelde versie die gespeeld wordt (wordt gemaakt door de publish-functie).
create table public.game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete restrict,
  version integer not null,
  package jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  unique (game_id, version)
);

-- -----------------------------------------------------------------------------
-- Sessies, teams en wat er tijdens een spel gebeurt
-- -----------------------------------------------------------------------------

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  game_version_id uuid not null references public.game_versions (id) on delete restrict,
  name text not null,
  starts_at timestamptz,
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{4,12}$'),
  track_count integer not null default 5 check (track_count between 1 and 50),
  test_mode boolean not null default false,
  status public.session_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  language text not null,
  login_order integer not null,
  track integer not null,
  -- Code om op een tweede telefoon verder te spelen.
  team_code text not null unique,
  started_at timestamptz,
  ended_at timestamptz,
  outcome text,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  unique (session_id, login_order)
);

-- Welke (anonieme) gebruikers bij een team horen.
create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

-- Alles wat er gebeurt; bron van score en resultaten. Het id maakt de app,
-- zodat dubbel versturen vanuit de wachtrij geen kwaad kan.
create table public.events (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  type text not null,
  task_key text,
  payload jsonb not null default '{}'::jsonb,
  client_time timestamptz not null,
  server_time timestamptz not null default now()
);
create index events_team_idx on public.events (team_id, client_time);

create table public.positions (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy real not null,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index positions_team_idx on public.positions (team_id, recorded_at);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  task_key text not null,
  path text not null,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  sender public.message_sender not null,
  sender_user uuid references auth.users (id) on delete set null,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_session_idx on public.messages (session_id, created_at);

-- -----------------------------------------------------------------------------
-- Hulpfuncties voor toegangsregels
-- -----------------------------------------------------------------------------

-- Is de ingelogde gebruiker lid van de organisatie (eventueel met een van deze rollen)?
create function public.is_member(p_org uuid, p_roles public.member_role[] default null)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

create function public.game_org(p_game uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select org_id from public.games where id = p_game $$;

create function public.can_edit_game(p_game uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_member(public.game_org(p_game), array['owner', 'admin', 'editor']::public.member_role[]) $$;

create function public.can_view_game(p_game uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_member(public.game_org(p_game)) $$;

-- Hoort de ingelogde gebruiker bij dit team?
create function public.is_team_member(p_team uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid()) $$;

-- Speelt de ingelogde gebruiker in deze sessie?
create function public.plays_in_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members tm join public.teams t on t.id = tm.team_id
    where t.session_id = p_session and tm.user_id = auth.uid()
  );
$$;

create function public.session_org(p_session uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select org_id from public.sessions where id = p_session $$;

create function public.team_session(p_team uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select session_id from public.teams where id = p_team $$;

-- Mag de gebruiker deze sessie beheren (spelleiding)?
create function public.can_run_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_member(public.session_org(p_session), array['owner', 'admin', 'editor', 'instructor']::public.member_role[]) $$;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.games enable row level security;
alter table public.tasks enable row level security;
alter table public.task_locations enable row level security;
alter table public.overridable_fields enable row level security;
alter table public.overrides enable row level security;
alter table public.translations enable row level security;
alter table public.rules enable row level security;
alter table public.playgrounds enable row level security;
alter table public.media enable row level security;
alter table public.game_versions enable row level security;
alter table public.sessions enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.events enable row level security;
alter table public.positions enable row level security;
alter table public.photos enable row level security;
alter table public.messages enable row level security;

-- Organisaties: leden lezen, owner/admin wijzigen. Aanmaken gaat via de service role.
create policy org_select on public.organizations for select to authenticated using (public.is_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.is_member(id, array['owner', 'admin']::public.member_role[]));

-- Leden: zien de leden van hun organisatie; owner/admin beheren.
create policy memberships_select on public.memberships for select to authenticated using (public.is_member(org_id));
create policy memberships_write on public.memberships for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin']::public.member_role[]))
  with check (public.is_member(org_id, array['owner', 'admin']::public.member_role[]));

-- Games: leden lezen, owner/admin/editor bewerken.
create policy games_select on public.games for select to authenticated using (public.is_member(org_id));
create policy games_write on public.games for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]))
  with check (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]));

-- Inhoud van een game: zelfde regels als de game.
create policy tasks_select on public.tasks for select to authenticated using (public.can_view_game(game_id));
create policy tasks_write on public.tasks for all to authenticated using (public.can_edit_game(game_id)) with check (public.can_edit_game(game_id));
create policy task_locations_select on public.task_locations for select to authenticated using (public.can_view_game(game_id));
create policy task_locations_write on public.task_locations for all to authenticated using (public.can_edit_game(game_id)) with check (public.can_edit_game(game_id));
create policy overridable_fields_select on public.overridable_fields for select to authenticated using (public.can_view_game(game_id));
create policy overridable_fields_write on public.overridable_fields for all to authenticated using (public.can_edit_game(game_id)) with check (public.can_edit_game(game_id));
create policy overrides_select on public.overrides for select to authenticated using (public.can_view_game(game_id));
create policy overrides_write on public.overrides for all to authenticated using (public.can_edit_game(game_id)) with check (public.can_edit_game(game_id));
create policy translations_select on public.translations for select to authenticated using (public.can_view_game(game_id));
create policy translations_write on public.translations for all to authenticated using (public.can_edit_game(game_id)) with check (public.can_edit_game(game_id));
create policy rules_select on public.rules for select to authenticated using (public.can_view_game(game_id));
create policy rules_write on public.rules for all to authenticated using (public.can_edit_game(game_id)) with check (public.can_edit_game(game_id));
create policy playgrounds_select on public.playgrounds for select to authenticated using (public.can_view_game(game_id));
create policy playgrounds_write on public.playgrounds for all to authenticated using (public.can_edit_game(game_id)) with check (public.can_edit_game(game_id));
create policy media_select on public.media for select to authenticated using (public.is_member(org_id));
create policy media_write on public.media for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]))
  with check (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]));

-- Gepubliceerde versies: beheerders lezen; spelers lezen alleen de versie van hun eigen sessie.
-- Publiceren gaat via de publish-functie (service role), daarom geen schrijfregel.
create policy game_versions_select_staff on public.game_versions for select to authenticated using (public.can_view_game(game_id));
create policy game_versions_select_player on public.game_versions for select to authenticated using (
  exists (select 1 from public.sessions s where s.game_version_id = game_versions.id and public.plays_in_session(s.id))
);

-- Sessies: leden lezen; spelleiding beheert; spelers lezen hun eigen sessie.
create policy sessions_select_staff on public.sessions for select to authenticated using (public.is_member(org_id));
create policy sessions_select_player on public.sessions for select to authenticated using (public.plays_in_session(id));
create policy sessions_write on public.sessions for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor', 'instructor']::public.member_role[]))
  with check (public.is_member(org_id, array['owner', 'admin', 'editor', 'instructor']::public.member_role[]));

-- Teams: spelleiding ziet en beheert alles; spelers zien de teams in hun sessie
-- (voor de scores van andere teams). Aanmaken gaat via join_session().
create policy teams_select_staff on public.teams for select to authenticated using (public.can_run_session(session_id));
create policy teams_select_player on public.teams for select to authenticated using (public.plays_in_session(session_id));
create policy teams_update_staff on public.teams for update to authenticated using (public.can_run_session(session_id));
create policy teams_delete_staff on public.teams for delete to authenticated using (public.can_run_session(session_id));

create policy team_members_select on public.team_members for select to authenticated
  using (user_id = auth.uid() or public.can_run_session(public.team_session(team_id)));

-- Gebeurtenissen, posities en foto's: een team schrijft en leest alleen zijn eigen;
-- de spelleiding leest alles van haar sessies. Niets is achteraf te wijzigen.
create policy events_select on public.events for select to authenticated
  using (public.is_team_member(team_id) or public.can_run_session(public.team_session(team_id)));
create policy events_insert on public.events for insert to authenticated
  with check (public.is_team_member(team_id) or public.can_run_session(public.team_session(team_id)));

create policy positions_select on public.positions for select to authenticated
  using (public.is_team_member(team_id) or public.can_run_session(public.team_session(team_id)));
create policy positions_insert on public.positions for insert to authenticated with check (public.is_team_member(team_id));

create policy photos_select on public.photos for select to authenticated
  using (public.plays_in_session(public.team_session(team_id)) or public.can_run_session(public.team_session(team_id)));
create policy photos_insert on public.photos for insert to authenticated with check (public.is_team_member(team_id));

-- Chat: een team ziet berichten aan het eigen team en aan iedereen in de sessie.
create policy messages_select on public.messages for select to authenticated using (
  public.can_run_session(session_id)
  or (public.plays_in_session(session_id) and (team_id is null or public.is_team_member(team_id)))
);
create policy messages_insert_team on public.messages for insert to authenticated with check (
  sender = 'team' and sender_user = auth.uid() and team_id is not null
  and public.is_team_member(team_id) and public.team_session(team_id) = session_id
);
create policy messages_insert_staff on public.messages for insert to authenticated with check (
  sender = 'staff' and sender_user = auth.uid() and public.can_run_session(session_id)
);

-- -----------------------------------------------------------------------------
-- Servertijd: een team kan de klok niet beïnvloeden
-- -----------------------------------------------------------------------------

create function public.force_server_time()
returns trigger
language plpgsql
as $$
begin
  new.server_time := now();
  return new;
end;
$$;

create trigger events_server_time before insert on public.events
  for each row execute function public.force_server_time();

create function public.force_received_at()
returns trigger
language plpgsql
as $$
begin
  new.received_at := now();
  return new;
end;
$$;

create trigger positions_received_at before insert on public.positions
  for each row execute function public.force_received_at();

-- Voor klokcorrectie in de app (estimateClockOffset).
create function public.server_time()
returns timestamptz
language sql stable
as $$ select now() $$;

-- -----------------------------------------------------------------------------
-- Inloggen als team
-- -----------------------------------------------------------------------------

create function public.random_code(p_length integer)
returns text
language sql volatile set search_path = ''
as $$
  -- Zonder letters die op cijfers lijken (0/O, 1/I).
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_length);
$$;

-- Team aanmaken met de inlogcode van een sessie. Het team krijgt automatisch
-- een track op volgorde van inloggen: team 1 → track 1, team 6 → weer track 1.
create function public.join_session(p_join_code text, p_team_name text, p_language text)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_session public.sessions;
  v_package jsonb;
  v_order integer;
  v_team public.teams;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'niet ingelogd' using errcode = '28000';
  end if;

  select * into v_session from public.sessions
  where join_code = upper(trim(p_join_code))
  for update;

  if not found or v_session.status <> 'open' then
    raise exception 'onbekende of gesloten sessie' using errcode = 'P0002';
  end if;

  select package into v_package from public.game_versions where id = v_session.game_version_id;
  if not (v_package -> 'languages') ? p_language then
    raise exception 'taal % niet beschikbaar', p_language using errcode = '22023';
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
  return v_team;
end;
$$;

-- Verder spelen op een tweede telefoon met de teamcode.
create function public.rejoin_team(p_team_code text)
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
  where t.team_code = upper(trim(p_team_code)) and s.status = 'open';
  if not found then
    raise exception 'onbekende teamcode' using errcode = 'P0002';
  end if;
  insert into public.team_members (team_id, user_id) values (v_team.id, auth.uid()) on conflict do nothing;
  return v_team;
end;
$$;

-- Start de speeltijd van het team (eenmalig, op servertijd).
create function public.start_team(p_team uuid)
returns public.teams
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_team public.teams;
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;
  update public.teams set started_at = coalesce(started_at, now()) where id = p_team returning * into v_team;
  return v_team;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rechten. RLS bepaalt welke rijen; anonieme bezoekers zonder sessie krijgen niets.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- Ook de hulpfuncties: de toegangsregels roepen ze aan met de rol van de gebruiker.
grant execute on all functions in schema public to authenticated;
