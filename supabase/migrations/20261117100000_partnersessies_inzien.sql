-- =============================================================================
-- Badass Games ziet de sessies van partners (alleen lezen)
--
-- Speelt een partner een spel van Badass Games, dan ziet Badass Games die
-- sessie op de resultatenpagina: teams, live posities, afstand, punten en de
-- foto's (bijvoorbeeld om het fotoboek te maken). Badass Games kan in die
-- sessie niets wijzigen; de partner houdt de spelleiding.
-- Een partner ziet nog steeds niets van Badass Games of van andere partners.
-- =============================================================================

-- De organisatie die het basisspel van deze sessie heeft gemaakt.
create function public.session_game_owner(p_session uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select public.game_org(public.root_game(v.game_id))
  from public.sessions s join public.game_versions v on v.id = s.game_version_id
  where s.id = p_session
$$;

-- Mag de gebruiker deze sessie bekijken: spelleiding van de sessie zelf, of
-- medewerker van de organisatie die het spel heeft gemaakt.
create function public.can_watch_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_run_session(p_session)
      or public.is_member(public.session_game_owner(p_session), array['owner', 'admin', 'editor', 'instructor']::public.member_role[]);
$$;

drop policy sessions_select_staff on public.sessions;
create policy sessions_select_staff on public.sessions for select to authenticated
  using (public.is_member(org_id) or public.can_watch_session(id));

drop policy teams_select_staff on public.teams;
create policy teams_select_staff on public.teams for select to authenticated
  using (public.can_watch_session(session_id));

drop policy events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (public.is_team_member(team_id) or public.can_watch_session(public.team_session(team_id)));

drop policy positions_select on public.positions;
create policy positions_select on public.positions for select to authenticated
  using (public.is_team_member(team_id) or public.can_watch_session(public.team_session(team_id)));

drop policy photos_select on public.photos;
create policy photos_select on public.photos for select to authenticated
  using (public.plays_in_session(public.team_session(team_id)) or public.can_watch_session(public.team_session(team_id)));

drop policy photos_read on storage.objects;
create policy photos_read on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    public.plays_in_session(public.team_session(((storage.foldername(name))[1])::uuid))
    or public.can_watch_session(public.team_session(((storage.foldername(name))[1])::uuid))
  )
);

create or replace function public.session_results(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.can_watch_session(p_session) or public.plays_in_session(p_session)) then
    raise exception 'geen toegang tot deze sessie' using errcode = '42501';
  end if;
  return public.build_session_results(p_session);
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.build_session_results(uuid), public.team_distance(uuid, timestamptz, timestamptz) from authenticated;
grant execute on function public.shared_session_results(text) to anon;
