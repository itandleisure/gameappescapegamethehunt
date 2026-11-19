-- =============================================================================
-- Foto in de teamchat
--
-- Een spelleider in de app zet een foto die al op zijn telefoon staat in de
-- teamchat (kanaal 'teams'), bijvoorbeeld van een team dat de hunters hebben
-- gepakt. Alle teams zien hem, als bericht van The Hunters.
--
-- De foto staat bij de eigen foto's van het fotoboek van de hunt (bucket
-- photobooks, <sessie>/eigen/chat-<id>.jpg). In het fotoboek-scherm staat hij
-- daardoor vanzelf onder "Niet in het fotoboek", klaar om toe te voegen.
--
-- - messages.photo_path: pad van de foto in de bucket photobooks.
-- - Spelleiders uploaden alleen chatfoto's van hun eigen hunt; teams en
--   spelleiders lezen de chatfoto's van hun hunt (andere eigen foto's van het
--   fotoboek blijven alleen voor het beheer).
-- =============================================================================

alter table public.messages add column photo_path text;

-- Een team zet nooit zelf een foto in een bericht.
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
  elsif new.channel = 'hunters' then
    new.sender_name := (select name from public.session_leaders
                        where session_id = new.session_id and user_id = new.sender_user);
  else
    new.sender_name := 'The Hunters';
  end if;
  return new;
end;
$$;

-- Is de ingelogde gebruiker spelleider van deze hunt? Voor de toegangsregels
-- van de opslag (is_session_leader zelf is niet openbaar).
create function public.leads_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select p_session is not null and public.is_session_leader(p_session) $$;
revoke execute on function public.leads_session(uuid) from public, anon;
grant execute on function public.leads_session(uuid) to authenticated;

-- Is dit pad een chatfoto (<sessie>/eigen/chat-<id>.jpg)?
create function public.is_chat_photo(p_name text)
returns boolean
language sql immutable set search_path = ''
as $$ select coalesce(array_length(storage.foldername(p_name), 1) = 2 and (storage.foldername(p_name))[2] = 'eigen'
                      and split_part(p_name, '/', 3) like 'chat-%', false) $$;
revoke execute on function public.is_chat_photo(text) from public, anon;
grant execute on function public.is_chat_photo(text) to authenticated;

create policy photobooks_chat_upload_leader on storage.objects for insert to authenticated with check (
  bucket_id = 'photobooks' and public.is_chat_photo(name)
  and public.leads_session(public.photobook_session(name))
);

create policy photobooks_chat_read on storage.objects for select to authenticated using (
  bucket_id = 'photobooks' and public.is_chat_photo(name)
  and (public.plays_in_session(public.photobook_session(name)) or public.leads_session(public.photobook_session(name)))
);

-- -----------------------------------------------------------------------------
-- Foto in de teamchat zetten
--
-- De app uploadt eerst de foto naar photobooks/<sessie>/eigen/chat-<id>.jpg en
-- roept dan deze functie aan met hetzelfde id, met eventueel een tekst erbij.
-- Nog een keer aanroepen (antwoord kwijt) geeft geen dubbel bericht.
-- -----------------------------------------------------------------------------

create function public.leader_send_photo(p_session uuid, p_photo uuid, p_body text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_path text := p_session::text || '/eigen/chat-' || p_photo::text || '.jpg';
  v_body text := coalesce(nullif(trim(coalesce(p_body, '')), ''), '📷');
  v_row public.messages;
begin
  perform public.require_session_leader(p_session);
  if length(v_body) > 500 then
    raise exception 'bericht moet 1 tot 500 tekens zijn' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'photobooks' and name = v_path) then
    raise exception 'foto niet gevonden' using errcode = '22023';
  end if;

  insert into public.messages (id, session_id, sender, channel, body, photo_path)
  values (p_photo, p_session, 'staff', 'teams', v_body, v_path)
  on conflict (id) do nothing;

  select * into v_row from public.messages where id = p_photo and session_id = p_session;
  return jsonb_build_object('id', v_row.id, 'team_id', v_row.team_id, 'sender', v_row.sender,
    'sender_name', v_row.sender_name, 'body', v_row.body, 'created_at', v_row.created_at,
    'photo_path', v_row.photo_path);
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
      select id, team_id, sender, sender_name, body, created_at, photo_path
      from public.messages
      where session_id = p_session and channel = 'teams'
      order by created_at desc
      limit 200
    ) m
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.leader_send_photo(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.leader_send_photo(uuid, uuid, text) to authenticated;
