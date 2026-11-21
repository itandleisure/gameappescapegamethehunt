-- Webshop maakt zelf tickets aan.
--
-- Koopt een klant in de webshop bijvoorbeeld "The Hunt Leeuwarden, 4 teams",
-- dan stuurt de webshop een bericht naar de edge function webshop-ticket
-- (supabase/functions/webshop-ticket). Die maakt een open ticket voor dat spel
-- met maximaal 4 teams en geeft de spelcode en de vaste spellink terug, die de
-- webshop in de bevestigingsmail zet.
--
-- * De webshop logt in met een geheime webshopsleutel per organisatie. Een
--   beheerder maakt die aan in Instellingen › Webshop; in de database staat
--   alleen de SHA-256 ervan. Een nieuwe sleutel maakt de oude ongeldig.
-- * Hetzelfde bestelnummer twee keer (de webshop probeert het opnieuw) geeft
--   hetzelfde ticket terug, en maakt geen tweede aan.
-- * Alleen spellen (steden of klantspellen) van de eigen organisatie, met een
--   gepubliceerde versie. Het ticket krijgt de nieuwste versie en de
--   standaardinstellingen uit Instellingen › Nieuwe tickets.

alter table public.sessions
  add column webshop_order text check (webshop_order is null or length(webshop_order) between 1 and 100);
create unique index sessions_webshop_order on public.sessions (org_id, webshop_order) where webshop_order is not null;

create table public.webshop_keys (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  last_used_at timestamptz
);
-- Beheerders zien of er een sleutel is en wanneer hij gebruikt is, niet de sleutel zelf.
alter table public.webshop_keys enable row level security;
create policy webshop_keys_select on public.webshop_keys for select to authenticated
  using (public.is_member(org_id, array['owner', 'admin']::public.member_role[]));
create policy webshop_keys_delete on public.webshop_keys for delete to authenticated
  using (public.is_member(org_id, array['owner', 'admin']::public.member_role[]));
revoke all on public.webshop_keys from anon, authenticated;
grant select (org_id, created_at, last_used_at), delete on public.webshop_keys to authenticated;

create function public.webshop_key_hash(p_key text)
returns text
language sql immutable set search_path = ''
as $$ select encode(extensions.digest(convert_to(trim(coalesce(p_key, '')), 'UTF8'), 'sha256'), 'hex') $$;
revoke execute on function public.webshop_key_hash(text) from public, anon, authenticated;

-- Nieuwe webshopsleutel; de oude werkt daarna niet meer. Alleen nu te zien.
create function public.new_webshop_key(p_org uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_key text := 'whk_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.is_member(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'alleen eigenaar of beheerder' using errcode = '42501';
  end if;
  insert into public.webshop_keys (org_id, key_hash, created_by)
  values (p_org, public.webshop_key_hash(v_key), auth.uid())
  on conflict (org_id) do update
    set key_hash = excluded.key_hash, created_at = now(), created_by = excluded.created_by, last_used_at = null;
  return v_key;
end;
$$;
revoke execute on function public.new_webshop_key(uuid) from public, anon;
grant execute on function public.new_webshop_key(uuid) to authenticated;

-- Ticket uit een webshopbestelling. Alleen voor de edge function (service_role).
create function public.webshop_create_ticket(
  p_key text,
  p_game text,
  p_teams integer,
  p_order text,
  p_name text default null,
  p_starts_at timestamptz default null
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_game public.games;
  v_version uuid;
  v_settings jsonb;
  v_order text := nullif(trim(coalesce(p_order, '')), '');
  v_session public.sessions;
  v_existing boolean := false;
  v_tz text;
  v_tracks integer;
begin
  select org_id into v_org from public.webshop_keys where key_hash = public.webshop_key_hash(p_key) and length(trim(coalesce(p_key, ''))) >= 20;
  if v_org is null then
    raise exception 'ongeldige webshopsleutel' using errcode = '28000';
  end if;
  update public.webshop_keys set last_used_at = now() where org_id = v_org;

  if v_order is null or length(v_order) > 100 then
    raise exception 'bestelnummer ontbreekt of is te lang' using errcode = '22023';
  end if;
  if p_teams is null or p_teams < 1 or p_teams > 500 then
    raise exception 'aantal teams moet tussen 1 en 500 liggen' using errcode = '22023';
  end if;

  -- Zelfde bestelling nog eens: hetzelfde ticket teruggeven.
  select * into v_session from public.sessions where org_id = v_org and webshop_order = v_order;
  if found then
    v_existing := true;
  else
    select * into v_game from public.games
    where public_id = public.game_public_id_from(p_game) and org_id = v_org and layer <> 'base';
    if v_game.id is null then
      raise exception 'onbekend spel %', p_game using errcode = 'P0002';
    end if;
    select id into v_version from public.game_versions where game_id = v_game.id order by version desc limit 1;
    if v_version is null then
      raise exception 'spel % is nog niet gepubliceerd', p_game using errcode = 'P0002';
    end if;

    select settings -> 'tickets' into v_settings from public.org_settings where org_id = v_org;
    v_tz := coalesce(nullif(v_settings ->> 'timezone', ''), 'Europe/Amsterdam');
    if not public.is_timezone(v_tz) then v_tz := 'Europe/Amsterdam'; end if;
    v_tracks := case when jsonb_typeof(v_settings -> 'track_count') = 'number'
                     then least(50, greatest(1, round((v_settings ->> 'track_count')::numeric)::int)) else 5 end;

    insert into public.sessions (org_id, game_version_id, name, starts_at, timezone, track_count, test_mode, team_chat,
                                 status, max_teams, webshop_order)
    values (v_org, v_version,
            left(coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Webshop ' || v_order), 120),
            p_starts_at, v_tz, v_tracks, false,
            coalesce((v_settings ->> 'team_chat')::boolean, false),
            'open', p_teams, v_order)
    returning * into v_session;
  end if;

  return (
    select jsonb_build_object(
      'ticket_id', v_session.id,
      'name', v_session.name,
      'code', v_session.join_code,
      'game_id', g.public_id,
      'max_teams', v_session.max_teams,
      'status', v_session.status,
      'starts_at', v_session.starts_at,
      'order', v_session.webshop_order,
      'existing', v_existing)
    from public.game_versions v join public.games g on g.id = v.game_id
    where v.id = v_session.game_version_id
  );
end;
$$;
revoke execute on function public.webshop_create_ticket(text, text, integer, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.webshop_create_ticket(text, text, integer, text, text, timestamptz) to service_role;
