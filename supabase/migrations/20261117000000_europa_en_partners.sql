-- =============================================================================
-- Uitrol in Europa: eigen game masters én lokale partners (docs/ontwerp.md §11.2)
--
-- - Een partner is een eigen organisatie met eigen beheerders, spelleiding,
--   sessies en resultaten (live kaart, afstand, punten, fotowall).
-- - Badass Games maakt de stadsvariant (locaties, iconen, overlay) en deelt
--   die met de partner. De partner speelt die zoals hij is, of maakt er
--   optioneel een klantvariant op met alleen de aanpasbare velden.
-- - Elke sessie heeft een tijdzone (Portugal loopt een uur achter).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Basisspel delen met partners
-- -----------------------------------------------------------------------------

create table public.game_shares (
  game_id uuid not null references public.games (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (game_id, org_id)
);
alter table public.game_shares enable row level security;

-- Hulpfuncties voor de lagen.
create function public.game_layer_of(p_game uuid)
returns public.game_layer
language sql stable security definer set search_path = ''
as $$ select layer from public.games where id = p_game $$;

-- Het basisspel waar een variant (via maximaal twee lagen) op voortbouwt.
create function public.root_game(p_game uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(g2.id, g1.id, g0.id)
  from public.games g0
  left join public.games g1 on g1.id = g0.parent_id
  left join public.games g2 on g2.id = g1.parent_id
  where g0.id = p_game
$$;

-- Is deze game rechtstreeks gedeeld met deze organisatie?
create function public.is_shared_with(p_game uuid, p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.game_shares where game_id = p_game and org_id = p_org) $$;

-- Mag de gebruiker deze game zien: lid van de eigenaar, of de game (of een
-- variant erop) is gedeeld met een organisatie van de gebruiker. Delen werkt
-- alleen omhoog: wie de stadsvariant Madrid krijgt, leest ook het basisspel
-- eronder, maar nooit andere steden of klanten van Badass Games.
create or replace function public.can_view_game(p_game uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_member(public.game_org(p_game))
      or exists (
        select 1 from public.game_shares s
        where public.is_member(s.org_id)
          and (
            s.game_id = p_game
            or exists (select 1 from public.games g1 where g1.id = s.game_id and g1.parent_id = p_game)
            or exists (
              select 1 from public.games g1 join public.games g2 on g2.id = g1.parent_id
              where g1.id = s.game_id and g2.parent_id = p_game
            )
          )
      );
$$;

drop policy games_select on public.games;
create policy games_select on public.games for select to authenticated using (public.can_view_game(id));

-- Varianten:
-- - een stadsvariant bouwt alleen voort op een game van de eigen organisatie
--   (Badass Games bepaalt de locaties, de iconen en de overlay);
-- - een partner maakt hooguit een klantvariant, op een game die rechtstreeks
--   met de partner is gedeeld.
drop policy games_write on public.games;
create policy games_write on public.games for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]))
  with check (
    public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[])
    and (
      parent_id is null
      or public.game_org(parent_id) = org_id
      or (layer = 'client' and public.is_shared_with(parent_id, org_id))
    )
  );

create policy game_shares_select on public.game_shares for select to authenticated
  using (public.is_member(org_id) or public.is_member(public.game_org(game_id)));
create policy game_shares_write on public.game_shares for all to authenticated
  using (public.is_member(public.game_org(game_id), array['owner', 'admin']::public.member_role[]))
  with check (public.is_member(public.game_org(game_id), array['owner', 'admin']::public.member_role[]));

grant select, insert, update, delete on public.game_shares to authenticated;

-- -----------------------------------------------------------------------------
-- Wat elke laag mag aanpassen
--
-- Opdrachten, regels en playgrounds bestaan alleen in het basisspel; locaties
-- alleen in het basisspel en de stadsvarianten. Een variant past verder alleen
-- de velden aan die het basisspel als aanpasbaar markeert voor die laag. Dit
-- is dezelfde regel die composeGame bij publiceren toepast, maar de database
-- houdt hem nu ook tegen voor iemand die buiten de beheeromgeving om schrijft.
-- -----------------------------------------------------------------------------

create function public.may_override(p_game uuid, p_task uuid, p_field text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.game_layer_of(p_game) <> 'base'
     and exists (
       select 1 from public.overridable_fields f
       where f.game_id = public.root_game(p_game)
         and f.task_id is not distinct from p_task
         and f.field = p_field
         and public.game_layer_of(p_game) = any (f.layers)
     );
$$;

-- Teksten: in het basisspel alles; in een variant alleen aanpasbare velden
-- (spelnaam en opdrachtteksten; hint.0, hint.1 … vallen onder 'hints').
create function public.may_translate(p_game uuid, p_entity text, p_entity_id text, p_field text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when public.game_layer_of(p_game) = 'base' then true
    when p_entity = 'game' then public.may_override(p_game, null, p_field)
    when p_entity = 'task' then public.may_override(
      p_game,
      (select t.id from public.tasks t where t.game_id = public.root_game(p_game) and t.key = p_entity_id),
      case when p_field like 'hint.%' then 'hints' else p_field end
    )
    else false
  end;
$$;

drop policy tasks_write on public.tasks;
create policy tasks_write on public.tasks for all to authenticated
  using (public.can_edit_game(game_id))
  with check (public.can_edit_game(game_id) and public.game_layer_of(game_id) = 'base');

drop policy rules_write on public.rules;
create policy rules_write on public.rules for all to authenticated
  using (public.can_edit_game(game_id))
  with check (public.can_edit_game(game_id) and public.game_layer_of(game_id) = 'base');

drop policy playgrounds_write on public.playgrounds;
create policy playgrounds_write on public.playgrounds for all to authenticated
  using (public.can_edit_game(game_id))
  with check (public.can_edit_game(game_id) and public.game_layer_of(game_id) = 'base');

drop policy overridable_fields_write on public.overridable_fields;
create policy overridable_fields_write on public.overridable_fields for all to authenticated
  using (public.can_edit_game(game_id))
  with check (public.can_edit_game(game_id) and public.game_layer_of(game_id) = 'base');

drop policy task_locations_write on public.task_locations;
create policy task_locations_write on public.task_locations for all to authenticated
  using (public.can_edit_game(game_id))
  with check (public.can_edit_game(game_id) and public.game_layer_of(game_id) in ('base', 'city'));

drop policy overrides_write on public.overrides;
create policy overrides_write on public.overrides for all to authenticated
  using (public.can_edit_game(game_id))
  with check (public.can_edit_game(game_id) and public.may_override(game_id, task_id, field));

drop policy translations_write on public.translations;
create policy translations_write on public.translations for all to authenticated
  using (public.can_edit_game(game_id))
  with check (public.can_edit_game(game_id) and public.may_translate(game_id, entity, entity_id, field));

-- Klantvariant maken, eventueel als kopie van een bestaande klantvariant op
-- dezelfde stad. Alleen de aanpassingen worden gekopieerd; de toegangsregels
-- hierboven gelden gewoon (de functie draait met de rechten van de gebruiker).
create function public.create_client_variant(p_org uuid, p_parent uuid, p_slug text, p_copy_from uuid default null)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_parent public.games;
  v_id uuid;
begin
  select * into v_parent from public.games where id = p_parent;
  if not found then
    raise exception 'onbekende game' using errcode = 'insufficient_privilege';
  end if;
  if p_copy_from is not null and not exists (
    select 1 from public.games where id = p_copy_from and layer = 'client' and parent_id = p_parent
  ) then
    raise exception 'kopiëren kan alleen van een klantvariant op dezelfde stad' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.games (org_id, parent_id, layer, slug, languages, default_language)
  values (p_org, p_parent, 'client', p_slug, v_parent.languages, v_parent.default_language)
  returning id into v_id;

  if p_copy_from is not null then
    insert into public.overrides (game_id, task_id, field, value)
    select v_id, task_id, field, value from public.overrides where game_id = p_copy_from;
    insert into public.translations (game_id, entity, entity_id, field, lang, text)
    select v_id, entity, entity_id, field, lang, text from public.translations where game_id = p_copy_from;
  end if;
  return v_id;
end;
$$;

-- Sessies alleen op een spelversie die de organisatie mag zien (eigen spel of
-- gedeeld), zodat een partner gewoon het gedeelde spel kan spelen.
create function public.version_game(p_version uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select game_id from public.game_versions where id = p_version $$;

drop policy sessions_write on public.sessions;
create policy sessions_write on public.sessions for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor', 'instructor']::public.member_role[]))
  with check (
    public.is_member(org_id, array['owner', 'admin', 'editor', 'instructor']::public.member_role[])
    and public.can_view_game(public.version_game(game_version_id))
  );

-- -----------------------------------------------------------------------------
-- Tijdzone per sessie
-- -----------------------------------------------------------------------------

create function public.is_timezone(p_name text)
returns boolean
language plpgsql immutable
as $$
begin
  perform now() at time zone p_name;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.sessions
  add column timezone text not null default 'Europe/Amsterdam' check (public.is_timezone(timezone));

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


revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.build_session_results(uuid), public.team_distance(uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.shared_session_results(text) to anon;
