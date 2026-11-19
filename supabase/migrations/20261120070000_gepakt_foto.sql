-- =============================================================================
-- Foto van een gepakt team
--
-- Pakt een hunter een team, dan tikt hij in de app op "+" bij gepakt en maakt
-- hij meteen een foto van het team. Die foto:
--
-- - komt in de teamchat (kanaal 'teams'), als bericht van The Hunters met de
--   foto erbij, zodat alle teams zien dat er een team gepakt is;
-- - staat bij de foto's van dat team (opdrachtsleutel "_gepakt"), en komt zo
--   vanzelf op de fotowall en in het fotoboek.
--
-- - messages.photo_path: pad van de foto in de bucket photos (alleen in
--   berichten van de spelleiding).
-- - messages.caught_team: naam van het gepakte team, zodat elke app de zin
--   "<team> is gepakt!" in de eigen taal toont. De Nederlandse zin staat ook
--   in body, voor oudere app-versies.
-- - Spelleiders in de app mogen de foto uploaden in <team>/_gepakt/ en lezen
--   de foto's van hun hunt.
-- =============================================================================

alter table public.messages
  add column photo_path text,
  add column caught_team text;

-- Een team zet nooit zelf een foto of "gepakt" in een bericht.
create or replace function public.message_defaults()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.sender_user := coalesce(auth.uid(), new.sender_user);
  new.created_at := now();
  if new.sender = 'team' then
    select name into new.sender_name from public.teams where id = new.team_id;
    new.photo_path := null;
    new.caught_team := null;
  elsif new.channel = 'hunters' then
    new.sender_name := (select name from public.session_leaders
                        where session_id = new.session_id and user_id = new.sender_user);
  else
    new.sender_name := 'The Hunters';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Opslag: spelleiders uploaden in <team>/_gepakt/ en lezen de foto's van hun hunt
-- -----------------------------------------------------------------------------

-- Is de ingelogde gebruiker spelleider in de hunt van dit team? Voor de
-- toegangsregels van de opslag (is_session_leader zelf is niet openbaar).
create function public.leads_team(p_team uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.is_session_leader(public.team_session(p_team)) $$;
revoke execute on function public.leads_team(uuid) from public, anon;
grant execute on function public.leads_team(uuid) to authenticated;

create policy photos_upload_leader on storage.objects for insert to authenticated with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[2] = '_gepakt'
  and public.leads_team(((storage.foldername(name))[1])::uuid)
);

create policy photos_read_leader on storage.objects for select to authenticated using (
  bucket_id = 'photos'
  and public.leads_team(((storage.foldername(name))[1])::uuid)
);

-- -----------------------------------------------------------------------------
-- Foto van een gepakt team delen
--
-- De app uploadt eerst de foto naar photos/<team>/_gepakt/<id>.jpg en roept
-- dan deze functie aan met hetzelfde id. Nog een keer aanroepen (geen bereik,
-- antwoord kwijt) geeft geen dubbele foto of dubbel bericht.
-- -----------------------------------------------------------------------------

create function public.leader_caught_photo(p_session uuid, p_team uuid, p_photo uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_team public.teams;
  v_path text := p_team::text || '/_gepakt/' || p_photo::text || '.jpg';
  v_row public.messages;
begin
  perform public.require_session_leader(p_session);
  select * into v_team from public.teams where id = p_team and session_id = p_session;
  if not found then
    raise exception 'team niet gevonden' using errcode = 'P0002';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'photos' and name = v_path) then
    raise exception 'foto niet gevonden' using errcode = '22023';
  end if;

  insert into public.photos (id, team_id, task_key, path)
  values (p_photo, p_team, '_gepakt', v_path)
  on conflict (id) do nothing;

  insert into public.messages (id, session_id, sender, channel, body, photo_path, caught_team)
  values (p_photo, p_session, 'staff', 'teams', v_team.name || ' is gepakt door The Hunters!', v_path, v_team.name)
  on conflict (id) do nothing;

  select * into v_row from public.messages where id = p_photo;
  return jsonb_build_object('id', v_row.id, 'team_id', v_row.team_id, 'sender', v_row.sender,
    'sender_name', v_row.sender_name, 'body', v_row.body, 'created_at', v_row.created_at,
    'photo_path', v_row.photo_path, 'caught_team', v_row.caught_team);
end;
$$;

-- Teamchat lezen in de app, nu met foto.
create or replace function public.leader_messages(p_session uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_session_leader(p_session);
  return coalesce((
    select jsonb_agg(m order by m.created_at)
    from (
      select id, team_id, sender, sender_name, body, created_at, photo_path, caught_team
      from public.messages
      where session_id = p_session and channel = 'teams'
      order by created_at desc
      limit 200
    ) m
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.leader_caught_photo(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.leader_caught_photo(uuid, uuid, uuid) to authenticated;
