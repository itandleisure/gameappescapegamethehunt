-- =============================================================================
-- Waarschuwing "Hunter in de buurt"
--
-- Spelleiders (de Hunters) loggen in de game-app in en delen hun positie
-- (session_leaders, elke 10 seconden). Een team vraagt hier of er een Hunter
-- binnen de ingestelde afstand is; de app trilt dan (met het scherm uit via een
-- melding op de telefoon zelf).
--
-- - Alleen ja of nee: nooit waar de Hunter is, welke kant op of hoe ver. Zo
--   verraadt de waarschuwing niets meer dan "pas op".
-- - De server gebruikt de laatst opgeslagen positie van het team zelf (die de
--   app toch al verstuurt). Een team kan dus niet met verzonnen coördinaten
--   gaan zoeken waar de Hunters zijn.
-- - Afstand per spel: GamePackage.hunterAlert.radius (meters, 0 = uit). Een
--   spel dat gepubliceerd is voordat dit bestond, gebruikt 100 meter.
-- - Alleen verse posities tellen (2 minuten), van Hunters met redelijke GPS.
-- =============================================================================

create function public.hunter_nearby(p_team uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_session uuid;
  v_radius double precision;
  v_lat double precision;
  v_lng double precision;
begin
  if not public.is_team_member(p_team) then
    raise exception 'geen lid van dit team' using errcode = '42501';
  end if;

  -- Alleen tijdens het spelen: gestart, niet afgelopen, hunt open.
  select t.session_id,
         coalesce((v.package #>> '{hunterAlert,radius}')::double precision, 100)
    into v_session, v_radius
    from public.teams t
    join public.sessions s on s.id = t.session_id
    join public.game_versions v on v.id = s.game_version_id
   where t.id = p_team
     and t.started_at is not null
     and t.ended_at is null
     and s.status = 'open'
     and s.anonymized_at is null;
  if not found or not (v_radius > 0) then
    return false;
  end if;

  select p.lat, p.lng into v_lat, v_lng
    from public.positions p
   where p.team_id = p_team and p.recorded_at > now() - interval '2 minutes'
   order by p.recorded_at desc
   limit 1;
  if not found then
    return false;
  end if;

  return exists (
    select 1 from public.session_leaders l
     where l.session_id = v_session
       and l.lat is not null and l.lng is not null
       and l.located_at > now() - interval '2 minutes'
       and coalesce(l.accuracy, 0) <= 75
       and public.haversine_m(v_lat, v_lng, l.lat, l.lng) <= v_radius
  );
end;
$$;

revoke execute on function public.hunter_nearby(uuid) from public, anon;
grant execute on function public.hunter_nearby(uuid) to authenticated;
