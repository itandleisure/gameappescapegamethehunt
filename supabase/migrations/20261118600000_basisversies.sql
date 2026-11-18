-- Versies van het basisspel.
--
-- Het basisspel (bijvoorbeeld "Escape Game The Hunt") blijft gewoon
-- bewerkbaar. Met "Nieuwe versie vastzetten" maakt de beheerder er een vaste
-- versie van: v1, v2, ... Elke stad kiest op welke versie van het basisspel
-- ze voortbouwt. Zo kan het basisspel verder groeien zonder dat steden
-- meteen veranderen, en zet je een stad bewust over naar een nieuwe versie.
--
-- - Een versie bewaart een kopie van de rijen van het basisspel (opdrachten,
--   regels, teksten, ...), in dezelfde vorm als de beheerapp ze leest.
-- - games.base_version: de versie waar een stad op voortbouwt. Leeg betekent
--   "de werkversie": de stad volgt het basisspel zoals het nu is.
-- - Een klantvariant (bijvoorbeeld The Hunt Leeuwarden voor een bedrijf)
--   volgt de versie van zijn stad.
-- - Bestaande basisspellen krijgen nu versie 1, en alle bestaande steden
--   worden aan versie 1 gekoppeld.

-- -----------------------------------------------------------------------------
-- Kopie van één laag, in de vorm van LayerRows in apps/admin/src/lib/game-model.ts
-- -----------------------------------------------------------------------------

create function public.layer_snapshot(p_game uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'game', (select to_jsonb(g) from (
      select id, layer, slug, parent_id, languages, default_language, settings
      from public.games where id = p_game) g),
    'tasks', coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.key) from (
      select id, key, position, answer, points, wrong_points, tags, hint_costs, has_confirm, retry_until_correct, settings
      from public.tasks where game_id = p_game) x), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select task_id, track, lat, lng, radius from public.task_locations where game_id = p_game) x), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(to_jsonb(x) order by x.position, x.key) from (
      select key, position, label, condition, actions from public.rules where game_id = p_game) x), '[]'::jsonb),
    'playgrounds', coalesce((select jsonb_agg(to_jsonb(x) order by x.key) from (
      select key from public.playgrounds where game_id = p_game) x), '[]'::jsonb),
    'overridable', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select task_id, field, layers, label from public.overridable_fields where game_id = p_game) x), '[]'::jsonb),
    'overrides', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select task_id, field, value from public.overrides where game_id = p_game) x), '[]'::jsonb),
    'translations', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select entity, entity_id, field, lang, text from public.translations where game_id = p_game) x), '[]'::jsonb)
  )
$$;

-- -----------------------------------------------------------------------------
-- Versies
-- -----------------------------------------------------------------------------

create table public.base_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  version integer not null check (version >= 1),
  note text check (note is null or length(note) <= 500),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (game_id, version)
);

alter table public.games
  add column base_version integer,
  add constraint games_base_version_city check (base_version is null or layer = 'city'),
  add constraint games_base_version_fk foreign key (parent_id, base_version)
    references public.base_versions (game_id, version) on delete restrict;

alter table public.base_versions enable row level security;
-- Wie het basisspel mag zien (ook een partner via een gedeelde stad), mag
-- ook de versies zien: die zijn nodig om een variant samen te stellen.
create policy base_versions_select on public.base_versions for select to authenticated
  using (public.can_view_game(game_id));
grant select on public.base_versions to authenticated;

-- Zet de huidige stand van een basisspel vast als nieuwe versie.
create function public.create_base_version(p_game uuid, p_note text default null)
returns public.base_versions
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_layer public.game_layer;
  v_row public.base_versions;
begin
  select layer into v_layer from public.games where id = p_game for update;
  if not found or not public.can_edit_game(p_game) then
    raise exception 'geen rechten om dit spel te bewerken' using errcode = '42501';
  end if;
  if v_layer <> 'base' then
    raise exception 'alleen een basisspel heeft versies' using errcode = '22023';
  end if;
  insert into public.base_versions (game_id, version, note, snapshot, created_by)
  values (
    p_game,
    coalesce((select max(version) from public.base_versions where game_id = p_game), 0) + 1,
    nullif(btrim(p_note), ''),
    public.layer_snapshot(p_game),
    auth.uid()
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- De kopie gaat alleen via create_base_version (met rechtencontrole).
revoke all on function public.layer_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.create_base_version(uuid, text) from public, anon;
grant execute on function public.create_base_version(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Bestaande spellen: versie 1, en elke stad op versie 1
-- -----------------------------------------------------------------------------

insert into public.base_versions (game_id, version, note, snapshot)
select id, 1, null, public.layer_snapshot(id) from public.games where layer = 'base';

update public.games set base_version = 1 where layer = 'city';
