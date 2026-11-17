-- =============================================================================
-- Uitrol in Europa: eigen game masters én lokale partners (docs/ontwerp.md §11.2)
--
-- - Een partner is een eigen organisatie met eigen beheerders, spelleiding,
--   sessies en resultaten. Badass Games deelt het basisspel met de partner;
--   de partner maakt daarop eigen stads- en klantvarianten, maar kan het
--   basisspel zelf niet wijzigen.
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

-- Mag de gebruiker deze game zien: lid van de eigenaar, of de game is gedeeld
-- met een organisatie van de gebruiker. Delen geldt alleen voor die game zelf:
-- een partner ziet het basisspel, niet de steden en klanten van Badass Games.
create or replace function public.can_view_game(p_game uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_member(public.game_org(p_game))
      or exists (select 1 from public.game_shares s where s.game_id = p_game and public.is_member(s.org_id));
$$;

drop policy games_select on public.games;
create policy games_select on public.games for select to authenticated using (public.can_view_game(id));

-- Een variant mag alleen voortbouwen op een game die de gebruiker mag zien.
drop policy games_write on public.games;
create policy games_write on public.games for all to authenticated
  using (public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[]))
  with check (
    public.is_member(org_id, array['owner', 'admin', 'editor']::public.member_role[])
    and (parent_id is null or public.can_view_game(parent_id))
  );

create policy game_shares_select on public.game_shares for select to authenticated
  using (public.is_member(org_id) or public.is_member(public.game_org(game_id)));
create policy game_shares_write on public.game_shares for all to authenticated
  using (public.is_member(public.game_org(game_id), array['owner', 'admin']::public.member_role[]))
  with check (public.is_member(public.game_org(game_id), array['owner', 'admin']::public.member_role[]));

grant select, insert, update, delete on public.game_shares to authenticated;

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
